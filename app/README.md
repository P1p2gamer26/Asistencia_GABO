# Sistema de Asistencia — Colegio Gabriel García Márquez

Aplicación web instalable (PWA) para la toma de asistencia, offline-first.
Reemplaza la solución anterior en Power Apps + Excel, que queda en `../legacy/`
únicamente como referencia visual.

## Estructura

```
app/
├── backend/      Spring Boot 3.4 · Java 21 · PostgreSQL 16 · API JSON
├── frontend/     React 18 · TypeScript · Vite · PWA
├── contracts/    Contrato de API congelado + fixtures compartidos
└── docker-compose.yml
```

## Arquitectura del backend (MVC por capas)

Estructura clásica en capas: cada capa es un paquete y ahí viven **todas** las
clases de esa capa.

```
co.edu.ggm.asistencia
├── AsistenciaApplication.java
├── config/       SecurityConfig, JwtFilter        ← configuración transversal
├── controller/   AuthController, CalendarController, AttendanceController,
│                 BootstrapController, EntryController, ReportController,
│                 GuardianController, ImportController        ← C de MVC
├── service/      AuthService, CalendarService, SyncService, DashboardService,
│                 ExcelReportService, NotificationService, NotificationJob,
│                 JwtService                                  ← lógica de negocio
├── repository/   UserRepository, StudentRepository, AttendanceRepository,
│                 CalendarRepository, ScheduleRepository, EntryRepository,
│                 ReportRepository, NotificationRepository    ← acceso a datos
└── model/        User, Role, Student, Attendance, SchoolDay, DayType,
                  ScheduleBlock, Subject, EntryLog, Notification   ← M de MVC
```

Reglas que no se negocian:

1. **Un controlador nunca habla con un repositorio.** Siempre pasa por un servicio.
   La única excepción son las consultas de solo lectura ya proyectadas a DTO, y aun
   así se prefiere un servicio si hay alguna decisión de por medio.
2. **Las entidades JPA no salen del backend.** Los controladores devuelven `record`
   DTO declarados en el propio controlador. Nunca se serializa una entidad
   directamente: expondría columnas internas y ataría la API al esquema.
3. **La "V" de MVC es el frontend.** El backend no renderiza vistas: expone JSON.
   La capa de presentación es React, y ahí la separación es página / componente.
4. **Nada de lógica de negocio en el repositorio** más allá de la consulta. Si hay
   un `if`, va en el servicio.
5. **Una clase nueva va a la capa que dice su sufijo**: `*Controller` a
   `controller/`, `*Service` y `*Job` a `service/`, `*Repository` a `repository/`,
   `*Config` y `*Filter` a `config/`, y todo lo demás a `model/`.

## Puesta en marcha

Requisitos: Java 21, Maven 3.9+, Node 20+, PostgreSQL 16.

```bash
# Base de datos (una vez)
psql -U postgres -c "CREATE DATABASE asistencia"
psql -U postgres -c "CREATE DATABASE asistencia_test"

# Backend  → http://localhost:8080
cd backend && mvn spring-boot:run

# Frontend → http://localhost:5173
cd frontend && npm install && npm run dev

# Frontend sin backend, contra los fixtures del contrato
cd frontend && VITE_MOCK=1 npm run dev
```

Tests:

```bash
cd backend  && mvn test     # requiere PostgreSQL en localhost:5432
cd frontend && npm test
```

Variables de entorno de los tests (con estos valores por defecto):
`TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test`,
`TEST_DB_USER=postgres`, `TEST_DB_PASSWORD=postgres`.

## Medir con el volumen real

Las pruebas normales usan tres estudiantes. Para medir con el volumen del colegio
—1.200 estudiantes, 900 bloques de horario y un semestre de asistencia, unos 620.000
registros y 146 MB— hay que crear una base aparte, dejar que Flyway la migre y
sembrarla:

```bash
psql -U postgres -c "CREATE DATABASE asistencia_carga"

cd app/backend && DB_URL=jdbc:postgresql://localhost:5432/asistencia_carga \
  DB_USER=postgres DB_PASSWORD=postgres SERVER_PORT=8082 mvn spring-boot:run
# una vez arrancado (crea el esquema), en otra terminal:
psql -U postgres -d asistencia_carga -f tools/datos-de-carga.sql
```

El script tarda unos minutos y deja las estadísticas al día. **No apuntar la aplicación
de verdad a esa base**: son datos inventados.

## Carga de datos

Tres importadores CSV, en `POST /api/admin/import/{students,schedule,guardians}`
(rol `ADMIN`). Cada uno crea lo que falte (materia, docente, acudiente) para no
obligar a cargar los ficheros en un orden distinto al natural. **Orden de carga:
estudiantes primero, horario despues, acudientes al final** — el horario y los
acudientes referencian estudiantes que ya deben existir.

Cabeceras exactas:

- `estudiantes.csv`: `document_id,first_name,middle_name,last_name,second_surname,grade`
- `horario.csv`: `grade,weekday,block_no,start_time,end_time,subject,teacher_email`
- `acudientes.csv`: `document_id,guardian_name,guardian_email,relationship`

```bash
TOKEN=... # de POST /api/auth/login con admin@ggm.edu.co
curl -X POST http://localhost:8080/api/admin/import/students  -H "Authorization: Bearer $TOKEN" -F "file=@estudiantes.csv"
curl -X POST http://localhost:8080/api/admin/import/schedule  -H "Authorization: Bearer $TOKEN" -F "file=@horario.csv"
curl -X POST http://localhost:8080/api/admin/import/guardians -H "Authorization: Bearer $TOKEN" -F "file=@acudientes.csv"
```

## Probar el modo sin conexión

**No se puede con `npm run dev`.** El service worker solo se genera en la compilación
de producción, así que en desarrollo, al cortar la red, el navegador muestra su página
de error. Eso no es un fallo de la aplicación.

Para probarlo de verdad hay que montar el escenario real, que es el frontend compilado
servido por Spring Boot:

```bash
cd app/frontend && npm run build
mkdir -p ../backend/src/main/resources/static
cp -r dist/* ../backend/src/main/resources/static/

cd ../backend && DB_URL=jdbc:postgresql://localhost:5432/asistencia \
  DB_USER=postgres DB_PASSWORD=postgres mvn spring-boot:run
```

Después, en `http://localhost:8080`: entrar, pulsar "Actualizar datos", cortar la red
(en el navegador o con `agent-browser set offline on`), recargar y comprobar que la
aplicación abre y deja marcar asistencia. Al restaurar la red, la cola debe vaciarse
sola.

**Borrar `app/backend/src/main/resources/static/` al terminar**: es salida de
compilación y no pertenece al repositorio.

## Probar la hora punta

El escenario real del colegio es que todos los docentes sincronizan a la vez, a las 7:00
de la mañana. `tools/carga-concurrente.sh` lo simula contra la base de carga:

```bash
# Lista de docentes con bloque el lunes, que el script necesita
psql -U postgres -d asistencia_carga -tAc "
SELECT u.email||'|'||b.id||'|'||b.grade FROM schedule_blocks b JOIN users u ON u.id=b.teacher_id
WHERE b.weekday=1 AND u.email LIKE 'docente%' ORDER BY u.id LIMIT 40" > /tmp/docentes.txt

MIN_ID=1 TOTAL_ESTUDIANTES=1203   bash tools/carga-concurrente.sh http://localhost:8082 2026-07-13 40
```

Medido el 22 de agosto de 2026: **40 docentes, 1.600 registros, 305 ms de media, 599 ms
el peor caso y 2,4 segundos en total**, sin errores ni bloqueos. PostgreSQL reporta cero
interbloqueos.

Se probó también el caso de contención de verdad —ocho docentes marcando **el mismo
bloque y los mismos estudiantes** a la vez, que es lo que pasa con un reemplazo—: los
ocho recibieron confirmación, quedaron **40 filas y no 320**, y el estado final fue el
del docente con la marca más reciente, que es la regla de resolución diseñada.

## Documentación

- **Despliegue en producción: `../docs/DESPLIEGUE.md`**
- Informe del proyecto: `../docs/INFORME-FINAL.md`
- Verificación del envío de correos: `../docs/VERIFICACION-CORREO.md`
- Plan de implementación: `../docs/superpowers/plans/2026-08-20-sistema-asistencia-paralelo.md`
- Contrato de API: `contracts/api.md`
- Estado de los tracks: `../docs/ESTADO.md`
