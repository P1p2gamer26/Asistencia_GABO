# sistema-control-asistencia

Aplicación para la toma de asistencia en el colegio Gabriel García Márquez.
Frontend PWA en React (Vite), API en Spring Boot 3 (Java 21) y base de datos PostgreSQL 16.

## Cómo correrlo en local (Windows)

### Requisitos

* Java 21 (`java -version`)
* Maven 3.9 (`mvn -version`)
* Node.js 20+ (`node -v`)
* PostgreSQL 16 corriendo y accesible en `localhost:5432`

### 1. Base de datos

El backend espera una base llamada `asistencia`. En esta máquina el Postgres local usa usuario `postgres` / clave `postgres`:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE asistencia"
```

(Solo la primera vez; si ya existe, salta este paso.)

### 2. Backend (puerto 8080)

Las variables de entorno se escriben distinto según la terminal que uses. Elige una:

**Opción A — cmd (símbolo del sistema):**

```bat
cd app\backend

set DB_URL=jdbc:postgresql://localhost:5432/asistencia
set DB_USER=postgres
set DB_PASSWORD=postgres

mvn spring-boot:run
```

**Opción B — PowerShell:**

```powershell
cd app\backend

$env:DB_URL = "jdbc:postgresql://localhost:5432/asistencia"
$env:DB_USER = "postgres"
$env:DB_PASSWORD = "postgres"

mvn spring-boot:run
```

> Ojo: `$env:...` solo funciona en PowerShell; en cmd da error de sintaxis y el backend arranca sin credenciales.

Cuando termine de arrancar, verifica con `http://localhost:8080/actuator/health` (debe responder `{"status":"UP"}`).
Las migraciones (Flyway) se aplican solas al arrancar.

Para pararlo: `Ctrl+C` en esa terminal.

### 3. Frontend (puerto 5173)

En **otra terminal** (cmd o PowerShell, da igual):

```
cd app\frontend
npm install   # solo la primera vez
npm run dev
```

Abre `http://localhost:5173`. Vite redirige las llamadas `/api/*` al backend del puerto 8080 (está configurado en `vite.config.ts`).

### Alternativa: frontend servido por el backend

Si prefieres todo desde un solo puerto (8080), compila el frontend y cópialo dentro del backend, luego arranca solo el backend:

```bat
cd app\frontend
npm run build
xcopy /e /y dist ..\backend\src\main\resources\static\
cd ..\backend
rem ... variables de entorno de arriba (set DB_URL=..., etc.) ...
mvn spring-boot:run
```

Y abre `http://localhost:8080` directamente.

### Verificación punta a punta

Con el backend arriba puedes correr la prueba de humo (requiere Git Bash / WSL):

```bash
./tools/humo.sh http://localhost:8080
```

### Problemas comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `FATAL: la autentificación password falló` | Credenciales de BD distintas | Ajusta `$env:DB_USER` / `$env:DB_PASSWORD` a las de tu Postgres |
| El backend no arranca: no conecta a la BD | Postgres apagado o en otro puerto | Verifica el servicio de PostgreSQL 16 y el puerto en `DB_URL` |
| Puerto 8080 ocupado | Otro proceso lo usa | `Get-NetTCPConnection -LocalPort 8080 -State Listen` para ver el PID y `Stop-Process -Id <pid> -Force` (puede pedir terminal de administrador) |
| El login da CORS/403 desde el navegador | Origen no permitido | Agrega el origen en `$env:APP_CORS_ORIGINS` (por defecto ya acepta `http://localhost:5173`) |

Usuarios semilla para probar (creados por las migraciones): docente `fpalacios@ggm.edu.co`, coordinación `coord@ggm.edu.co`, ambos con clave `cambiar123`.

## Base local y base de producción

Son dos bases distintas y **nunca** se tocan entre sí:

| | Local (desarrollo) | Producción |
|---|---|---|
| Dónde | PostgreSQL en tu máquina | Supabase (gestionada, con backups) |
| Nombre de la base | `asistencia` | `postgres` |
| Quién despliega | nadie: la levantas tú | Render, al hacer push a `main` |
| Datos de demostración | sí, con el script de abajo | **no**: solo lo que cargue el colegio |

El script de siembra **aborta solo** si detecta que no está corriendo contra la base
`asistencia`, así que pegar por error la cadena de Supabase no puede vaciar el colegio.
Las migraciones de Flyway sí corren en ambas al arrancar el backend: **cualquier
migración nueva llega a producción en el siguiente despliegue**.

### Datos de demostración (solo en local)

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d asistencia -f tools/datos-colegio.sql
```

Siembra 12 cursos (`0A` a `11A`) con 25 estudiantes cada uno, 12 docentes con su
materia, el horario de 7:00 a 1:30 (6 bloques de 60 minutos, descanso de 10:00 a 10:30),
los acudientes y la asistencia del mes. Incluye a propósito los casos raros que si no
nunca se pueden ver: un curso sin ningún registro, bloques sin reportar, un estudiante
retirado y una jornada institucional. Es idempotente: repetirlo da exactamente lo mismo.

| Usuario | Clave | Rol |
|---|---|---|
| `admin@ggm.edu.co` | `cambiar123` | administración |
| `coord@ggm.edu.co` | `cambiar123` | coordinación |
| `docente01@ggm.edu.co` … `docente12@ggm.edu.co` | `cambiar123` | docentes |
| `acudiente.<documento>@correo.com` | `cambiar123` | acudientes |

Para medir rendimiento con 620.000 registros está `tools/datos-de-carga.sql`, que va
contra la base aparte `asistencia_carga` (ver `app/README.md`).

## Pendientes y Mejoras: Sistema de Registro de Asistencia

**Estado Actual:** La aplicación ya filtra estudiantes por curso, permite marcar la asistencia (P, T, F, E) y guarda los registros en Excel con la hora local ajustada y el correo del profesor.

### Estabilidad de Datos

* **Migración de Base de Datos:** Actualmente se usa Excel. Se recomienda migrar a SharePoint Lists o Dataverse. El Excel causa errores de bloqueo si alguien más lo tiene abierto en el navegador y Power Apps no puede escribir en él.
* **Validación de Registros Duplicados:** Implementar una lógica que impida guardar la asistencia dos veces para el mismo curso el mismo día. Actualmente, el botón Patch crea registros nuevos cada vez que se pulsa.
* **Tablas códigos:** Crear nuevas tablas con la lista de estudiantes, fotos y códigos qr/barras para gestionar la asistencia al ingreso al colegio. Los código de la DB deben ser los que vengan en el carnet, no deben ser creados.

### Agregar funcionalidad (Back-end)

* **Notificación evasión:** Enviar una notificación al correo institucional de las coordinadoras con los estudiantes que sean marcados como "evadiendo clase" para seguir con el proceso respectivo.
* **Notificación falta o llegada tarde:** Enviar una notificación al correo de los padres cuando un estudiante llegue muy tarde a clase o falte.
* **Detalles estudiantes:** Agregar en la tarjeta de cada estudiante la opción de buscar más información del estudiante, como teléfono, dirección y eps.

### Experiencia de Usuario (UI/UX)

* **Pantalla de Confirmación/Historial:** Crear una vista donde el profesor pueda ver qué cursos ya marcaron asistencia hoy para evitar olvidos.
* **Pantalla Consulta:** Crear una pantalla donde los profesores puedan consultar información de diferentes cursos o estudiantes y obtener reportes sobre la asistencia.
