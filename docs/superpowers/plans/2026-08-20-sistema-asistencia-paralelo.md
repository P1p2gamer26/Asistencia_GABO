# Sistema de Asistencia GGM — Plan Paralelo (3 terminales)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la app Power Apps + Excel del Colegio Gabriel Garcia Marquez por una PWA multiusuario offline-first con backend Java/Spring Boot, PostgreSQL, calendario academico real y dashboard de indicadores — construida por tres personas en paralelo.

**Architecture:** Backend Spring Boot 3.4 (Java 21) que expone solo JSON, con PostgreSQL + Flyway y JWT stateless. Frontend React + Vite compilado a PWA instalable: descarga horario, calendario y estudiantes a IndexedDB, permite marcar asistencia sin senal y sincroniza con una cola idempotente. El calendario academico (lectivo / festivo / vacaciones / institucional / suspendido) es una tabla de la base, no una regla en codigo. La app Power Apps existente queda solo como mockup de referencia visual.

**Tech Stack:** Java 21, Spring Boot 3.4, Spring Data JPA, Spring Security (JWT), PostgreSQL 16, Flyway, Apache POI, Maven, JUnit 5 + Testcontainers, React 18 + TypeScript + Vite, vite-plugin-pwa (Workbox), Dexie (IndexedDB), react-router, SVG inline sin libreria de graficas.

**Spec:** `PSU - Toma de asistencia/Documento de Contexto - Proyecto Social Universitario (2).docx`, `PSU - Toma de asistencia/Pruebas.docx` (feedback de docentes), `README.md` (pendientes). Mockups: `Sistema_asistencia_20260527051853/`.

**Sustituye a:** `docs/superpowers/plans/2026-08-20-sistema-asistencia-web.md` (plan secuencial, v1). **Convencion de este documento:** las tareas que no cambiaron respecto a v1 dicen literalmente *"ejecuta la Task N de v1 sin cambios"* y esa referencia apunta a un documento real y completo en este mismo repositorio — no es un pendiente. Todo lo nuevo o modificado (calendario, dashboard, contratos, esqueletos compartidos) va escrito completo aqui.

---

## Global Constraints

- **Java 21**, Spring Boot **3.4.x**, Maven. Nada de Gradle.
- **PostgreSQL 16** en todos los entornos. H2 prohibido incluso en tests: **Testcontainers**.
- **Todo el esquema se crea con migraciones Flyway.** `spring.jpa.hibernate.ddl-auto=validate` siempre.
- **Rangos de version de Flyway reservados por track** (evita colisiones al fusionar): Fase 0 -> `V1`-`V9`. Track A -> `V10`-`V19`. Track B -> ninguna. Track C -> `V20`-`V29`.
- **Ancho de banda es el recurso escaso.** Bundle inicial < 200 KB gzip. Prohibido: librerias de componentes, librerias de graficas, icon fonts, Google Fonts remotas, imagenes > 30 KB. CSS y SVG a mano.
- **Toda escritura es idempotente.** El cliente genera el `id` (UUID v4); el servidor actualiza-o-inserta. Reintentar una sincronizacion nunca duplica.
- **El codigo del carnet es el numero de tarjeta de identidad del estudiante.** Se llama `document_id` en la base y es la clave natural. **No se genera ninguno**: el que trae el carnet impreso es el que manda (requisito explicito del `README`).
- **Ninguna asistencia existe fuera del calendario.** Una fecha que no sea `LECTIVO` en `school_calendar` se rechaza en el backend y se bloquea en la interfaz.
- **Zona horaria:** el servidor guarda `TIMESTAMPTZ` en UTC; la conversion a `America/Bogota` es de la capa de presentacion. Prohibido restar 5 horas a mano.
- **Idioma:** identificadores en ingles, texto visible en espanol. Sin tildes ni letra ene en nombres de columnas, tablas, campos JSON ni ficheros.
- **Roles:** `ADMIN`, `COORDINADOR`, `DOCENTE`, `ACUDIENTE`.
- **Estados:** `P` (presente), `T` (tarde), `F` (falta), `E` (evasion).
- **Colores de estado (fijos, ya validados — no cambiarlos "porque se ven mejor"):** `P` `#0ca30c`, `T` `#fab219`, `F` `#d03b3b`, `E` `#ec835a`. **El orden de apilado es siempre P, T, F, E.** Ver la Task C2 para el porque.
- **Commits:** Conventional Commits en espanol, un commit por tarea como minimo.

## Dimensionamiento (fijado, no re-discutir)

1200 estudiantes x 6 bloques x ~190 dias lectivos (ya descontando festivos y vacaciones) = **~1,37 M filas/ano** de asistencia, mas ~228 K de ingreso. A ~250 B/fila con indices: **~400 MB el primer ano, ~2 GB a 5 anos**. Cualquier VPS pequeno o tier gratis lo aguanta. El cuello de botella es la conectividad del colegio, no el disco.

---

## Como se trabaja en paralelo

### El mecanismo real (leelo antes de abrir las tres terminales)

**No existe un canal de chat entre sesiones de Claude Code en terminales distintas.** Lo que si existe, y es lo que se usa aqui:

| Herramienta | Que hace de verdad | Sirve para |
|---|---|---|
| `git worktree` / `EnterWorktree` | Tres copias del repo en tres carpetas, tres ramas, un solo `.git` | **Que las tres terminales no se pisen.** Es la pieza clave |
| Subagentes (`Agent`) + `SendMessage` | Varios agentes **dentro de una misma terminal**, con contexto aislado, que se mandan mensajes entre si y reportan al hilo principal | Paralelizar dentro de **una** terminal |
| Un fichero de coordinacion en el repo | Estado compartido, asincrono, versionado | **Que las tres terminales se enteren de lo que hacen las otras** |

`SendMessage` solo alcanza a los agentes que la propia sesion lanzo (o a `main` desde un subagente en segundo plano). La terminal 2 no puede mandarle un mensaje a la terminal 1: son procesos distintos que no comparten transcripcion. Quien diga lo contrario esta describiendo subagentes dentro de una sesion, no tres terminales.

Asi que la coordinacion entre las tres terminales es **el repositorio**: contratos congelados en la Fase 0 + propiedad exclusiva de ficheros + un `docs/ESTADO.md` que cada track actualiza al terminar una tarea. Aburrido y funciona. Un bus de mensajes entre sesiones seria mas vistoso y traeria justo lo que no se necesita: estado que se pierde al cerrar la terminal.

### Preparacion (una vez, antes de repartir)

```bash
git worktree add .worktrees/track-a -b track-a-nucleo
git worktree add .worktrees/track-b -b track-b-app
git worktree add .worktrees/track-c -b track-c-analitica
```

Verificar antes que `.worktrees` este en `.gitignore` (`git check-ignore -q .worktrees`); si no lo esta, anadirlo y commitear. En sesiones de Claude Code, usar la herramienta `EnterWorktree` en vez de `git worktree add` a mano.

Cada terminal arranca con `cd .worktrees/track-X` y trabaja **solo** en su rama. Cada track necesita su propia base de datos para no pisar los datos de los otros:

```bash
# terminal A: puerto 5432 | terminal B: 5433 | terminal C: 5434
DB_PORT=5433 docker compose up -d db
```
(La Fase 0 deja el `docker-compose.yml` parametrizado para esto.)

### Propiedad de ficheros (la regla que hace posible el paralelismo)

Un fichero tiene **un solo dueno**. Si necesitas tocar uno ajeno, no lo toques: la Fase 0 ya dejo el hueco preparado, y si falta uno, se anota en `docs/ESTADO.md` y lo hace el dueno.

| Ruta | Dueno |
|---|---|
| `backend/src/**/user/`, `config/`, `schedule/`, `student/`, `sync/`, `attendance/`, `calendar/` | **Track A** |
| `frontend/src/api/`, `db/`, `sync/`, `pages/Login`, `Home`, `TomarAsistencia`, `Ingreso`, `scan/`, `components/BannerEstado` | **Track B** |
| `backend/src/**/report/`, `notify/`, `admin/`, `entry/` | **Track C** |
| `frontend/src/pages/Consultas`, `Dashboard`, `Padre`, `components/charts/` | **Track C** |
| `frontend/src/App.tsx`, `main.tsx`, `styles.css`, `index.html` | **Fase 0** (congelado; nadie lo edita despues) |
| `backend/pom.xml`, `frontend/package.json` | **Fase 0** (congelado: todas las dependencias entran de una vez) |
| `contracts/` | **Fase 0** (congelado; cambiarlo exige acuerdo de los tres) |
| `docs/ESTADO.md` | Todos, en append |

`App.tsx` y `styles.css` se congelan en la Fase 0 **con todas las rutas y todas las clases ya escritas**, apuntando a componentes marcador. Cada track solo rellena su propio fichero de pagina. Es la razon por la que tres personas pueden tocar el frontend sin resolver conflictos a diario.

### Dependencias entre tracks

```
Fase 0 (secuencial, 1 terminal)
   |
   +--> Track A  (nucleo: auth, calendario, bootstrap, sincronizacion)
   +--> Track B  (app del docente: PWA offline, asistencia, QR)
   +--> Track C  (analitica: dashboard, reportes, notificaciones, importacion)
   |
Fase Z (secuencial, 1 terminal): integracion y despliegue
```

Los tres tracks arrancan **a la vez** en cuanto la Fase 0 esta en `main`. B y C no esperan a que A implemente los endpoints: programan contra los **fixtures del contrato** (`contracts/fixtures/*.json`), y tanto A como B tienen un test que verifica que su lado coincide con el fixture. Cuando A termina, la integracion ya esta probada por ambos extremos.

### Ritual por tarea (las tres terminales igual)

1. `git pull origin main && git rebase main` antes de empezar.
2. Ejecutar la tarea completa, tests incluidos.
3. Anadir una linea a `docs/ESTADO.md`: `- [A2] hecho 2026-08-21 — GET /api/calendar/school-days operativo`.
4. Commit y `git push origin <rama>`.
5. Al cerrar cada track, PR a `main`.

---

## Fase 0 — Cimientos compartidos (secuencial, UNA sola terminal)

Nadie abre las otras dos terminales hasta que esta fase este fusionada en `main`. Es corta y es la que hace que el resto no colisione.

### Task 0.1: Esqueletos con todas las dependencias de una vez

**Files:**
- Create: `backend/pom.xml`, `backend/src/main/java/co/edu/ggm/asistencia/AsistenciaApplication.java`, `backend/src/main/resources/application.yml`
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`
- Create: `docker-compose.yml`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/AbstractIntegrationTest.java`, `SmokeTest.java`

**Interfaces:**
- Produces: `AbstractIntegrationTest` (base con PostgreSQL 16 via Testcontainers) que extienden **todos** los tests de los tres tracks.

- [ ] **Step 1: Ejecutar la Task 1 de v1 (`docs/superpowers/plans/2026-08-20-sistema-asistencia-web.md`), Steps 1 a 8, sin cambios**

Eso deja `pom.xml`, la clase principal, `application.yml`, `AbstractIntegrationTest` y `SmokeTest`.

- [ ] **Step 2: Anadir AHORA todas las dependencias que necesitaran A y C**

`pom.xml` se congela en esta tarea. Si un track tuviera que anadir una dependencia despues, los tres chocarian en el mismo fichero al fusionar. Anadir dentro de `<dependencies>`:

```xml
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-api</artifactId><version>0.12.6</version></dependency>
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-impl</artifactId><version>0.12.6</version><scope>runtime</scope></dependency>
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-jackson</artifactId><version>0.12.6</version><scope>runtime</scope></dependency>
<dependency><groupId>org.apache.poi</groupId><artifactId>poi-ooxml</artifactId><version>5.3.0</version></dependency>
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-mail</artifactId></dependency>
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-actuator</artifactId></dependency>
```

- [ ] **Step 3: Parametrizar el puerto en `docker-compose.yml`**

Cada track levanta su propia base en un puerto distinto y no se pisan los datos.

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: asistencia
      POSTGRES_USER: asistencia
      POSTGRES_PASSWORD: asistencia
    ports: ["${DB_PORT:-5432}:5432"]
    volumes: ["pgdata_${DB_PORT:-5432}:/var/lib/postgresql/data"]
volumes:
  pgdata_5432:
  pgdata_5433:
  pgdata_5434:
```

- [ ] **Step 4: Crear el frontend con TODAS las dependencias**

Ejecutar la Task 6 de v1, Steps 1 a 4, con este `package.json` (incluye ya `@zxing/browser` del Track B; no hay libreria de graficas porque el dashboard va en SVG a mano):

```json
{
  "name": "ggm-asistencia",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@zxing/browser": "^0.1.5",
    "dexie": "^4.0.10",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vite-plugin-pwa": "^0.21.1",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 5: Ejecutar el test de humo**

Run: `cd backend && ./mvnw test -Dtest=SmokeTest`
Expected: FAIL (aun no hay migraciones). Lo arregla la Task 0.2.

- [ ] **Step 6: Commit**

```bash
git add backend frontend docker-compose.yml
git commit -m "chore: esqueletos de backend y frontend con dependencias congeladas"
```

---

### Task 0.2: Esquema completo incluido el calendario academico

**Files:**
- Create: `backend/src/main/resources/db/migration/V1__esquema_inicial.sql`
- Create: `backend/src/main/resources/db/migration/V2__calendario.sql`
- Create: `backend/src/main/resources/db/migration/V3__datos_semilla.sql`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/SchemaTest.java`

**Interfaces:**
- Produces: todas las tablas del sistema, incluida `school_calendar`. Los tres tracks programan contra este esquema y **ninguno lo modifica** salvo en sus rangos de version reservados.

- [ ] **Step 1: Ejecutar la Task 2 de v1, Steps 1 y 3, sin cambios**

Eso deja `V1__esquema_inicial.sql` (tablas `users`, `students`, `guardianships`, `subjects`, `schedule_blocks`, `attendance` con `attendance_unique_slot`, `entry_log`) y `SchemaTest`.

- [ ] **Step 2: Escribir `V2__calendario.sql`**

Una fila por fecha del ano escolar. Son ~365 filas al ano: nada. Se elige tabla y no un motor de reglas por dos razones concretas: (1) los festivos colombianos siguen la Ley Emiliani, que traslada varios al lunes siguiente y cuya implementacion en codigo es mas larga y mas fragil que teclear las fechas; (2) el colegio necesita poder marcar a mano un dia de paro, una jornada pedagogica o un dia de la familia, y eso ninguna regla lo predice.

```sql
CREATE TABLE school_calendar (
    calendar_date DATE        PRIMARY KEY,
    day_type      VARCHAR(16) NOT NULL
                  CHECK (day_type IN ('LECTIVO','FESTIVO','VACACIONES','INSTITUCIONAL','SUSPENDIDO')),
    description   VARCHAR(120),
    updated_by    BIGINT      REFERENCES users(id),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_lectivos ON school_calendar (calendar_date)
    WHERE day_type = 'LECTIVO';

COMMENT ON TABLE school_calendar IS
    'Una fila por fecha del ano escolar. LECTIVO es el unico tipo en el que se puede registrar asistencia.';
```

Significado de cada tipo, para que nadie improvise:

| `day_type` | Que es | Se toma asistencia |
|---|---|---|
| `LECTIVO` | Dia de clase normal | **Si** |
| `FESTIVO` | Festivo nacional (Ley Emiliani incluida) | No |
| `VACACIONES` | Receso escolar | No |
| `INSTITUCIONAL` | Jornada pedagogica, sin estudiantes | No |
| `SUSPENDIDO` | Cancelado sobre la marcha: paro, emergencia, clima | No |

- [ ] **Step 3: Sembrar el calendario 2026 en la misma migracion `V2`**

Se genera el ano completo de lunes a viernes como `LECTIVO` y despues se sobrescriben festivos y vacaciones. Generar primero y corregir despues es mas corto y mucho menos propenso a olvidos que teclear 190 fechas.

```sql
-- Todos los dias habiles del ano escolar 2026 como lectivos
INSERT INTO school_calendar (calendar_date, day_type)
SELECT d::date, 'LECTIVO'
FROM generate_series(DATE '2026-01-19', DATE '2026-12-04', INTERVAL '1 day') AS d
WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5;

-- Festivos nacionales de Colombia 2026 (Ley Emiliany ya aplicada: varios caen en lunes)
INSERT INTO school_calendar (calendar_date, day_type, description) VALUES
 ('2026-01-01','FESTIVO','Ano nuevo'),
 ('2026-01-12','FESTIVO','Reyes Magos'),
 ('2026-03-23','FESTIVO','San Jose'),
 ('2026-04-02','FESTIVO','Jueves Santo'),
 ('2026-04-03','FESTIVO','Viernes Santo'),
 ('2026-05-01','FESTIVO','Dia del trabajo'),
 ('2026-05-18','FESTIVO','Ascension'),
 ('2026-06-08','FESTIVO','Corpus Christi'),
 ('2026-06-15','FESTIVO','Sagrado Corazon'),
 ('2026-06-29','FESTIVO','San Pedro y San Pablo'),
 ('2026-07-20','FESTIVO','Independencia'),
 ('2026-08-07','FESTIVO','Batalla de Boyaca'),
 ('2026-08-17','FESTIVO','Asuncion'),
 ('2026-10-12','FESTIVO','Dia de la raza'),
 ('2026-11-02','FESTIVO','Todos los santos'),
 ('2026-11-16','FESTIVO','Independencia de Cartagena'),
 ('2026-12-08','FESTIVO','Inmaculada Concepcion'),
 ('2026-12-25','FESTIVO','Navidad')
ON CONFLICT (calendar_date) DO UPDATE
  SET day_type = EXCLUDED.day_type, description = EXCLUDED.description;

-- Recesos escolares (calendario A, ajustar con la rectoria antes de produccion)
INSERT INTO school_calendar (calendar_date, day_type, description)
SELECT d::date, 'VACACIONES', r.nombre
FROM (VALUES
        (DATE '2026-03-30', DATE '2026-04-03', 'Semana Santa'),
        (DATE '2026-06-15', DATE '2026-07-10', 'Receso de mitad de ano'),
        (DATE '2026-10-05', DATE '2026-10-09', 'Receso de octubre')
     ) AS r(inicio, fin, nombre),
     LATERAL generate_series(r.inicio, r.fin, INTERVAL '1 day') AS d
WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
ON CONFLICT (calendar_date) DO UPDATE
  SET day_type = EXCLUDED.day_type, description = EXCLUDED.description;
```

**Antes de produccion hay que confirmar estas fechas con la rectoria.** Las de recesos son las tipicas del calendario A y el colegio puede tener las suyas; la Task A2 deja la pantalla para corregirlas sin tocar SQL.

- [ ] **Step 4: Escribir `V3__datos_semilla.sql`**

Ejecutar el Step 2 de la Task 2 de v1 sin cambios (usuarios, materias, estudiantes y un bloque de horario de ejemplo).

- [ ] **Step 5: Ampliar `SchemaTest` con el calendario**

Anadir a la clase creada en el Step 1:

```java
    @Test
    void el_calendario_marca_los_festivos_como_no_lectivos() {
        String tipo = jdbc.queryForObject(
                "SELECT day_type FROM school_calendar WHERE calendar_date = DATE '2026-07-20'",
                String.class);
        assertThat(tipo).isEqualTo("FESTIVO");
    }

    @Test
    void semana_santa_quedo_como_vacaciones_y_no_como_lectivo() {
        Integer lectivos = jdbc.queryForObject("""
                SELECT count(*) FROM school_calendar
                WHERE calendar_date BETWEEN DATE '2026-03-30' AND DATE '2026-04-03'
                  AND day_type = 'LECTIVO'
                """, Integer.class);
        assertThat(lectivos).isZero();
    }

    @Test
    void el_ano_escolar_tiene_un_numero_de_dias_lectivos_razonable() {
        Integer lectivos = jdbc.queryForObject(
                "SELECT count(*) FROM school_calendar WHERE day_type = 'LECTIVO'", Integer.class);
        // El minimo legal en Colombia son 40 semanas; el tope sano es 200 dias.
        assertThat(lectivos).isBetween(170, 200);
    }

    @Test
    void los_sabados_y_domingos_no_existen_en_el_calendario() {
        Integer finesDeSemana = jdbc.queryForObject("""
                SELECT count(*) FROM school_calendar
                WHERE EXTRACT(ISODOW FROM calendar_date) > 5 AND day_type = 'LECTIVO'
                """, Integer.class);
        assertThat(finesDeSemana).isZero();
    }
```

- [ ] **Step 6: Ejecutar los tests**

Run: `cd backend && ./mvnw test`
Expected: PASS todo. Si "dias lectivos razonable" falla, revisar las fechas de recesos del Step 3 — es exactamente el error que ese test existe para atrapar.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat: esquema completo con calendario academico y festivos de Colombia"
```

---

### Task 0.3: Contratos congelados, fixtures y esqueleto del frontend

**Files:**
- Create: `contracts/api.md`
- Create: `contracts/fixtures/bootstrap.json`, `contracts/fixtures/summary.json`, `contracts/fixtures/dashboard.json`
- Create: `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/styles.css`
- Create: `frontend/src/api/contract.ts`
- Create: `docs/ESTADO.md`

**Interfaces:**
- Produces: **el contrato**. A implementa contra el, B y C programan contra el sin esperar a A, y ambos lados tienen un test que compara con el mismo fixture. Cambiarlo despues exige acuerdo de los tres tracks y una linea en `docs/ESTADO.md`.

- [ ] **Step 1: Escribir `contracts/api.md`**

```markdown
# Contrato de API — congelado en la Fase 0

Todas las rutas cuelgan de `/api`. Todas menos `/auth/**` exigen
`Authorization: Bearer <token>`. Errores: 401 sin token o token vencido,
403 rol incorrecto, 400 cuerpo invalido.

## Auth  (Track A)
POST /auth/login    {email, password} -> {token, refreshToken, role, fullName, userId}
POST /auth/refresh  {refreshToken}    -> igual que login

## Calendario  (Track A)
GET  /calendar/school-days?from=YYYY-MM-DD&to=YYYY-MM-DD
     -> [{calendarDate, dayType, description}]
PUT  /calendar/school-days/{date}   (ADMIN, COORDINADOR)
     {dayType, description} -> {calendarDate, dayType, description}

## Sincronizacion  (Track A)
GET  /sync/bootstrap
     -> {blocks:[{id, grade, weekday, blockNo, subject, startTime}],
         students:[{id, documentId, fullName, grade}],
         schoolDays:[{calendarDate, dayType}]}
GET  /schedule/mine -> blocks del bootstrap

## Asistencia  (Track A)
POST /attendance/sync
     {records:[{id, studentId, scheduleBlockId, classDate, status, comment?, recordedAt}]}
     -> {accepted, rejected:[{id, reason}]}
GET  /attendance?blockId=&date= -> [{id, studentId, status, comment}]

## Ingreso  (Track C)
POST /entry/sync  {entries:[{id, documentId, scannedAt}]}
     -> {accepted, rejected:[{id, reason}], names:{<uuid>: "NOMBRE"}}

## Reportes  (Track C)
GET  /reports/summary?grade=&from=&to=
     -> [{studentId, documentId, fullName, grade, present, late, absent, evasion, schoolDays}]
GET  /reports/excel?grade=&from=&to=   -> binario .xlsx
GET  /reports/pending-today -> [{blockId, grade, subject, blockNo}]
GET  /reports/dashboard?from=&to=&grade=
     -> {kpi:{attendanceRate, absentToday, evasionsWeek, blocksPending, schoolDays},
         byGrade:[{grade, present, late, absent, evasion}],
         trend:[{classDate, attendanceRate}]}

## Acudiente  (Track C)
GET  /guardian/children
     -> [{studentId, fullName, grade, recent:[{classDate, subject, status, comment}]}]

## Administracion  (Track C)
POST /admin/import/students  multipart file=CSV -> {imported, errors:[String]}

## Reglas transversales
- `status` es siempre uno de P, T, F, E.
- `classDate` solo puede ser una fecha con dayType = LECTIVO. Si no, el registro
  se rechaza con reason = "La fecha no es un dia lectivo".
- Los `id` son UUID v4 generados por el cliente. Reenviar el mismo lote nunca duplica.
```

- [ ] **Step 2: Escribir `contracts/fixtures/bootstrap.json`**

Es la respuesta que A debe producir y contra la que B programa. Los datos coinciden con la semilla de la Task 0.2.

```json
{
  "blocks": [
    { "id": 1, "grade": "601", "weekday": 1, "blockNo": 1, "subject": "Matematicas", "startTime": "06:30" }
  ],
  "students": [
    { "id": 1, "documentId": "1010101010", "fullName": "LINDA ISABELLA AREVALO FIGUEROA", "grade": "601" },
    { "id": 2, "documentId": "1010101011", "fullName": "JUAN DIEGO AVILA VERGARA", "grade": "601" }
  ],
  "schoolDays": [
    { "calendarDate": "2026-07-13", "dayType": "LECTIVO" },
    { "calendarDate": "2026-07-20", "dayType": "FESTIVO" }
  ]
}
```

- [ ] **Step 3: Escribir `contracts/fixtures/dashboard.json`**

```json
{
  "kpi": { "attendanceRate": 94.2, "absentToday": 38, "evasionsWeek": 7, "blocksPending": 3, "schoolDays": 21 },
  "byGrade": [
    { "grade": "601", "present": 780, "late": 41, "absent": 52, "evasion": 6 },
    { "grade": "602", "present": 742, "late": 63, "absent": 71, "evasion": 11 },
    { "grade": "701", "present": 810, "late": 29, "absent": 34, "evasion": 3 }
  ],
  "trend": [
    { "classDate": "2026-07-06", "attendanceRate": 95.1 },
    { "classDate": "2026-07-07", "attendanceRate": 93.8 },
    { "classDate": "2026-07-08", "attendanceRate": 94.6 },
    { "classDate": "2026-07-09", "attendanceRate": 91.2 },
    { "classDate": "2026-07-10", "attendanceRate": 96.0 }
  ]
}
```

- [ ] **Step 4: Escribir `contracts/fixtures/summary.json`**

```json
[
  { "studentId": 1, "documentId": "1010101010", "fullName": "LINDA ISABELLA AREVALO FIGUEROA",
    "grade": "601", "present": 18, "late": 1, "absent": 2, "evasion": 0, "schoolDays": 21 },
  { "studentId": 2, "documentId": "1010101011", "fullName": "JUAN DIEGO AVILA VERGARA",
    "grade": "601", "present": 15, "late": 3, "absent": 2, "evasion": 1, "schoolDays": 21 }
]
```

- [ ] **Step 5: Escribir `frontend/src/api/contract.ts`**

Los tipos compartidos viven aqui, en un fichero que nadie edita despues. Si B y C declararan cada uno sus tipos, divergirian en una semana.

```ts
export type Role = 'ADMIN' | 'COORDINADOR' | 'DOCENTE' | 'ACUDIENTE';
export type Status = 'P' | 'T' | 'F' | 'E';
export type DayType = 'LECTIVO' | 'FESTIVO' | 'VACACIONES' | 'INSTITUCIONAL' | 'SUSPENDIDO';

export type Session = {
  token: string; refreshToken: string; role: Role; fullName: string; userId: number;
};
export type Block = {
  id: number; grade: string; weekday: number; blockNo: number; subject: string; startTime: string;
};
export type StudentDto = { id: number; documentId: string; fullName: string; grade: string };
export type SchoolDay = { calendarDate: string; dayType: DayType; description?: string };
export type Bootstrap = { blocks: Block[]; students: StudentDto[]; schoolDays: SchoolDay[] };

export type SummaryRow = {
  studentId: number; documentId: string; fullName: string; grade: string;
  present: number; late: number; absent: number; evasion: number; schoolDays: number;
};
export type GradeBreakdown = {
  grade: string; present: number; late: number; absent: number; evasion: number;
};
export type Dashboard = {
  kpi: { attendanceRate: number; absentToday: number; evasionsWeek: number;
         blocksPending: number; schoolDays: number };
  byGrade: GradeBreakdown[];
  trend: { classDate: string; attendanceRate: number }[];
};

/** Orden de apilado y colores de estado. Validado; ver Task C2. No reordenar. */
export const ESTADOS: { valor: Status; etiqueta: string; color: string }[] = [
  { valor: 'P', etiqueta: 'Presente', color: '#0ca30c' },
  { valor: 'T', etiqueta: 'Tarde',    color: '#fab219' },
  { valor: 'F', etiqueta: 'Falta',    color: '#d03b3b' },
  { valor: 'E', etiqueta: 'Evasion',  color: '#ec835a' },
];
```

- [ ] **Step 6: Escribir `frontend/src/App.tsx` con TODAS las rutas y componentes marcador**

Este fichero se congela aqui. Cada track rellena su propio fichero de pagina y **no vuelve a tocar `App.tsx`**. Es lo que evita que tres personas peleen por el enrutador.

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { getSession } from './api/client';

// Track B rellena estos:
import Login from './pages/Login';
import Home from './pages/Home';
import TomarAsistencia from './pages/TomarAsistencia';
import Ingreso from './pages/Ingreso';
// Track C rellena estos:
import Consultas from './pages/Consultas';
import Dashboard from './pages/Dashboard';
import Padre from './pages/Padre';

function Protegida({ children }: { children: React.ReactNode }) {
  return getSession() ? <>{children}</> : <Navigate to="/login" replace />;
}

function SoloRoles({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  return roles.includes(session.role) ? <>{children}</> : <Navigate to="/" replace />;
}

/** El acudiente no ve el menu del docente: su inicio es su propio portal. */
function Inicio() {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  return session.role === 'ACUDIENTE' ? <Padre /> : <Home />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Inicio />} />
      <Route path="/asistencia" element={<Protegida><TomarAsistencia /></Protegida>} />
      <Route path="/ingreso" element={<Protegida><Ingreso /></Protegida>} />
      <Route path="/consultas"
             element={<SoloRoles roles={['DOCENTE', 'COORDINADOR', 'ADMIN']}><Consultas /></SoloRoles>} />
      <Route path="/dashboard"
             element={<SoloRoles roles={['COORDINADOR', 'ADMIN']}><Dashboard /></SoloRoles>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

Crear **de una vez** los siete ficheros de pagina como marcador, para que el proyecto compile desde el minuto cero y cada track solo tenga que reemplazar el suyo:

```tsx
// frontend/src/pages/<Nombre>.tsx — repetir para Login, Home, TomarAsistencia,
// Ingreso, Consultas, Dashboard y Padre, cambiando el nombre de la funcion.
export default function Nombre() {
  return <main className="card"><p>Pendiente</p></main>;
}
```

`main.tsx` es el de la Task 6 de v1, Step 10, sin cambios.

- [ ] **Step 7: Escribir `frontend/src/styles.css` completo y congelado**

Todas las clases que usaran los tres tracks, escritas de una vez. Un track que necesite una clase nueva la anota en `docs/ESTADO.md` en vez de editar este fichero.

```css
:root {
  --azul: #3860b2; --azul-oscuro: #00126b; --fondo: #f1f4f9;
  --superficie: #fcfcfb; --tinta: #0b0b0b; --tinta-suave: #52514e; --tinta-mute: #898781;
  --rejilla: #e1e0d9; --eje: #c3c2b7;
  --estado-p: #0ca30c; --estado-t: #fab219; --estado-f: #d03b3b; --estado-e: #ec835a;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
       background: var(--fondo); color: var(--tinta); }
.card { background: #fff; border-radius: 8px; padding: 16px; margin: 16px; }
.login { display: flex; flex-direction: column; gap: 8px; max-width: 420px; }
input, select, button { font: inherit; padding: 12px; border-radius: 6px; border: 1px solid #ccd; }
button { background: var(--azul); color: #fff; border: 0; min-height: 48px; }
button:disabled { opacity: .6; }
.secundario { background: #667; }
.error { color: #b00020; }
.meta { color: var(--tinta-suave); font-size: .9rem; }
.filtros { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; }
.acciones { display: flex; flex-direction: column; gap: 12px; margin: 16px 0; }
.boton { display: block; text-align: center; padding: 16px; background: var(--azul);
         color: #fff; border-radius: 6px; text-decoration: none; }
.estudiantes { list-style: none; padding: 0; margin: 16px 0; }
.estudiantes li { border-bottom: 1px solid var(--rejilla); padding: 10px 0;
                  display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
.nombre { display: flex; flex-direction: column; }
.nombre small { color: var(--tinta-suave); }
.estados { display: flex; gap: 4px; }
.estado { min-width: 48px; min-height: 48px; padding: 0; background: #fff;
          color: var(--azul-oscuro); border: 1px solid #ccd; font-weight: 700; }
.estado.activo { color: #fff; }
.estado.P.activo { background: var(--estado-p); border-color: var(--estado-p); }
.estado.T.activo { background: var(--estado-t); border-color: var(--estado-t); color: var(--tinta); }
.estado.F.activo { background: var(--estado-f); border-color: var(--estado-f); }
.estado.E.activo { background: var(--estado-e); border-color: var(--estado-e); color: var(--tinta); }
.comentario { grid-column: 1 / -1; }
.banner { padding: 10px; border-radius: 6px; margin-bottom: 12px;
          display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.banner.offline { background: #ffe9b8; }
.banner.pendiente { background: #dbe6ff; }
.banner button { min-height: 40px; padding: 6px 12px; }
.camara { width: 100%; max-height: 50vh; background: #000; border-radius: 8px; }
.ultimo { font-size: 1.2rem; font-weight: 700; color: var(--azul-oscuro); }
.novedades { list-style: none; padding: 0; }
.novedades li { padding: 8px 0; border-bottom: 1px solid var(--rejilla); }
.novedades em { color: var(--tinta-suave); }
.tabla-scroll { overflow-x: auto; margin-top: 16px; }
table { border-collapse: collapse; width: 100%; font-size: .95rem; }
th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--rejilla); white-space: nowrap; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.kpi { background: var(--superficie); border: 1px solid var(--rejilla);
       border-radius: 8px; padding: 14px; }
.kpi .valor { font-size: 2rem; font-weight: 700; line-height: 1.1; }
.kpi .etiqueta { color: var(--tinta-suave); font-size: .85rem; }
.grafica { background: var(--superficie); border: 1px solid var(--rejilla);
           border-radius: 8px; padding: 14px; margin-top: 16px; }
.grafica h3 { margin: 0 0 4px; font-size: 1rem; }
.grafica figcaption { color: var(--tinta-suave); font-size: .85rem; margin-bottom: 12px; }
.leyenda { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px;
           font-size: .85rem; color: var(--tinta-suave); }
.leyenda span { display: inline-flex; align-items: center; gap: 6px; }
.leyenda i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.no-lectivo { background: #f4f4f2; color: var(--tinta-mute); }
```

- [ ] **Step 8: Crear `docs/ESTADO.md`**

```markdown
# Estado de los tres tracks

Cada track anade una linea al terminar una tarea. Es el unico canal de
comunicacion entre las tres terminales: no hay mensajeria entre sesiones.

Formato: `- [<tarea>] <estado> <fecha> — <nota>`

## Bitacora
- [0.1] hecho — esqueletos y dependencias congeladas
- [0.2] hecho — esquema con calendario academico
- [0.3] hecho — contratos congelados; los tres tracks pueden arrancar

## Cambios al contrato (requiere acuerdo de los tres)
_(vacio)_

## Bloqueos
_(vacio)_
```

- [ ] **Step 9: Verificar que el frontend compila**

Run: `cd frontend && npm install && npm run build`
Expected: build correcto con las siete paginas marcador.

- [ ] **Step 10: Commit y fusionar a `main`**

```bash
git add contracts frontend docs
git commit -m "feat: contratos congelados, fixtures y esqueleto de frontend compartido"
# push deshabilitado: el remoto es ajeno. Solo commits locales.
```

**A partir de aqui se abren las tres terminales.**

---

# TRACK A — Nucleo (terminal 1, rama `track-a-nucleo`)

Autenticacion, calendario academico, paquete de arranque y sincronizacion. Es el track del que dependen los otros dos en tiempo de integracion, pero **no en tiempo de desarrollo**: B y C trabajan contra los fixtures.

### Task A1: Autenticacion JWT y los cuatro roles

**Files:** los de la Task 3 de v1.

- [ ] **Step 1: Ejecutar la Task 3 de v1 completa, Steps 2 a 11**

Saltar el Step 1 (las dependencias de jjwt ya entraron en la Task 0.1).

- [ ] **Step 2: Anotar en `docs/ESTADO.md`**

```
- [A1] hecho — POST /api/auth/login y /refresh operativos
```

- [ ] **Step 3: Commit**

```bash
git add backend docs && git commit -m "feat: autenticacion JWT con los cuatro roles"
```

---

### Task A2: API del calendario academico

**Files:**
- Create: `backend/src/main/java/co/edu/ggm/asistencia/calendar/SchoolDay.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/calendar/DayType.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/calendar/CalendarRepository.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/calendar/CalendarService.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/calendar/CalendarController.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/calendar/CalendarTest.java`

**Interfaces:**
- Consumes: `school_calendar` (Task 0.2), auth (Task A1).
- Produces:
  - `GET /api/calendar/school-days?from=&to=` -> `[{calendarDate, dayType, description}]` (cualquier rol autenticado).
  - `PUT /api/calendar/school-days/{date}` (ADMIN, COORDINADOR) -> el dia actualizado.
  - `CalendarService.isSchoolDay(LocalDate): boolean` — **lo consume la Task A4 y es la razon de ser de este servicio**.

`isSchoolDay` cachea el conjunto de dias lectivos en memoria: son ~190 fechas al ano y se consultan una vez por cada registro de un lote de 40 estudiantes. Ir a la base 40 veces por lote para preguntar lo mismo seria absurdo. La cache se invalida cuando el `PUT` cambia un dia.

- [ ] **Step 1: Escribir el test (falla)**

```java
package co.edu.ggm.asistencia.calendar;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.config.JwtService;
import co.edu.ggm.asistencia.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class CalendarTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired CalendarService service;

    private String token(String email, String rol) {
        var u = users.findByEmailAndActiveTrue(email).orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), rol);
    }

    @Test
    void devuelve_el_rango_pedido_con_su_tipo_de_dia() throws Exception {
        mvc.perform(get("/api/calendar/school-days")
                        .param("from", "2026-07-20").param("to", "2026-07-21")
                        .header("Authorization", token("fpalacios@ggm.edu.co", "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.length()").value(2))
           .andExpect(jsonPath("$[0].calendarDate").value("2026-07-20"))
           .andExpect(jsonPath("$[0].dayType").value("FESTIVO"));
    }

    @Test
    void isSchoolDay_distingue_lectivo_de_festivo() {
        assertThat(service.isSchoolDay(LocalDate.parse("2026-07-20"))).isFalse();  // Independencia
        assertThat(service.isSchoolDay(LocalDate.parse("2026-07-21"))).isTrue();   // martes normal
        assertThat(service.isSchoolDay(LocalDate.parse("2026-07-19"))).isFalse();  // domingo, no existe
    }

    @Test
    void coordinacion_puede_suspender_un_dia_y_la_cache_se_entera() throws Exception {
        LocalDate dia = LocalDate.parse("2026-09-15");
        assertThat(service.isSchoolDay(dia)).isTrue();

        mvc.perform(put("/api/calendar/school-days/2026-09-15")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dayType\":\"SUSPENDIDO\",\"description\":\"Paro de transporte\"}")
                        .header("Authorization", token("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.dayType").value("SUSPENDIDO"));

        assertThat(service.isSchoolDay(dia)).isFalse();
    }

    @Test
    void un_docente_no_puede_modificar_el_calendario() throws Exception {
        mvc.perform(put("/api/calendar/school-days/2026-09-16")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dayType\":\"SUSPENDIDO\"}")
                        .header("Authorization", token("fpalacios@ggm.edu.co", "DOCENTE")))
           .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 2: Ejecutar — debe fallar**

Run: `cd backend && ./mvnw test -Dtest=CalendarTest`
Expected: FAIL, `CalendarService` no existe.

- [ ] **Step 3: Escribir `DayType` y `SchoolDay`**

```java
package co.edu.ggm.asistencia.calendar;

public enum DayType { LECTIVO, FESTIVO, VACACIONES, INSTITUCIONAL, SUSPENDIDO }
```

```java
package co.edu.ggm.asistencia.calendar;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "school_calendar")
@Getter
@Setter
public class SchoolDay {
    @Id
    @Column(name = "calendar_date")
    private LocalDate calendarDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "day_type")
    private DayType dayType;

    private String description;

    @Column(name = "updated_by") private Long updatedBy;
    @Column(name = "updated_at") private Instant updatedAt;
}
```

- [ ] **Step 4: Escribir `CalendarRepository`**

```java
package co.edu.ggm.asistencia.calendar;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface CalendarRepository extends JpaRepository<SchoolDay, LocalDate> {

    List<SchoolDay> findByCalendarDateBetweenOrderByCalendarDate(LocalDate from, LocalDate to);

    List<SchoolDay> findByDayType(DayType dayType);
}
```

- [ ] **Step 5: Escribir `CalendarService`**

```java
package co.edu.ggm.asistencia.calendar;

import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class CalendarService {

    private final CalendarRepository repo;

    /**
     * Cache de dias lectivos. Son ~190 fechas al ano y se consultan una vez por cada
     * registro de un lote de 40 estudiantes: ir a la base cada vez seria absurdo.
     * ponytail: Set en memoria; si algun dia hay varias instancias del backend,
     * cambiar a cache distribuida o TTL corto.
     */
    private volatile Set<LocalDate> lectivos = ConcurrentHashMap.newKeySet();

    public CalendarService(CalendarRepository repo) { this.repo = repo; }

    @PostConstruct
    void cargar() {
        lectivos = repo.findByDayType(DayType.LECTIVO).stream()
                .map(SchoolDay::getCalendarDate)
                .collect(Collectors.toCollection(ConcurrentHashMap::newKeySet));
    }

    public boolean isSchoolDay(LocalDate date) {
        return lectivos.contains(date);
    }

    public List<SchoolDay> range(LocalDate from, LocalDate to) {
        return repo.findByCalendarDateBetweenOrderByCalendarDate(from, to);
    }

    @Transactional
    public SchoolDay update(LocalDate date, DayType type, String description, Long userId) {
        SchoolDay dia = repo.findById(date).orElseGet(() -> {
            var nuevo = new SchoolDay();
            nuevo.setCalendarDate(date);
            return nuevo;
        });
        dia.setDayType(type);
        dia.setDescription(description);
        dia.setUpdatedBy(userId);
        dia.setUpdatedAt(Instant.now());
        SchoolDay guardado = repo.save(dia);

        if (type == DayType.LECTIVO) lectivos.add(date); else lectivos.remove(date);
        return guardado;
    }
}
```

- [ ] **Step 6: Escribir `CalendarController`**

```java
package co.edu.ggm.asistencia.calendar;

import co.edu.ggm.asistencia.config.JwtService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/calendar")
public class CalendarController {

    private final CalendarService service;

    public CalendarController(CalendarService service) { this.service = service; }

    public record DayDto(LocalDate calendarDate, DayType dayType, String description) {}
    public record UpdateRequest(@NotNull DayType dayType, String description) {}

    @GetMapping("/school-days")
    public List<DayDto> range(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.range(from, to).stream()
                .map(d -> new DayDto(d.getCalendarDate(), d.getDayType(), d.getDescription()))
                .toList();
    }

    @PutMapping("/school-days/{date}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    public DayDto update(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                         @Valid @RequestBody UpdateRequest req) {
        var d = service.update(date, req.dayType(), req.description(), JwtService.currentUserId());
        return new DayDto(d.getCalendarDate(), d.getDayType(), d.getDescription());
    }
}
```

- [ ] **Step 7: Ejecutar los tests**

Run: `cd backend && ./mvnw test -Dtest=CalendarTest`
Expected: PASS los cuatro.

- [ ] **Step 8: Anotar y commitear**

```bash
echo '- [A2] hecho — GET/PUT /api/calendar/school-days e isSchoolDay operativos' >> docs/ESTADO.md
git add backend docs && git commit -m "feat: calendario academico con dias lectivos, festivos y suspensiones"
```

---

### Task A3: Paquete de arranque con calendario incluido

**Files:**
- Los de la Task 4 de v1, mas: Modify `backend/src/main/java/co/edu/ggm/asistencia/sync/BootstrapController.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/sync/BootstrapTest.java`

**Interfaces:**
- Consumes: Task A1, Task A2.
- Produces: `GET /api/sync/bootstrap` -> `{blocks, students, schoolDays}` exactamente como en `contracts/fixtures/bootstrap.json`.

Cambio respecto a v1: el bootstrap **tambien baja el calendario**, porque el docente sin senal necesita saber que el 20 de julio no se toma asistencia. Se baja un mes atras y tres adelante: el ano completo son ~250 fechas y no hacen falta para trabajar la semana.

- [ ] **Step 1: Ejecutar la Task 4 de v1, Steps 1 a 6**

- [ ] **Step 2: Anadir `schoolDays` al `BootstrapController`**

Sustituir el record `Bootstrap` y el metodo `bootstrap()` por:

```java
    public record Bootstrap(List<BlockDto> blocks, List<StudentDto> students,
                            List<CalendarController.DayDto> schoolDays) {}

    @GetMapping("/sync/bootstrap")
    public Bootstrap bootstrap() {
        List<ScheduleBlock> myBlocks = schedules
                .findByTeacherIdOrderByWeekdayAscBlockNoAsc(JwtService.currentUserId());
        Set<String> grades = myBlocks.stream().map(ScheduleBlock::getGrade).collect(Collectors.toSet());
        List<Student> myStudents = grades.isEmpty()
                ? List.of()
                : students.findByActiveTrueAndGradeInOrderByLastNameAscFirstNameAsc(grades);

        // Ventana corta a proposito: un mes atras para corregir dias pasados,
        // tres adelante para planear. El ano entero serian ~250 fechas de mas.
        LocalDate hoy = LocalDate.now(ZoneId.of("America/Bogota"));
        List<CalendarController.DayDto> dias = calendar.range(hoy.minusMonths(1), hoy.plusMonths(3))
                .stream()
                .map(d -> new CalendarController.DayDto(d.getCalendarDate(), d.getDayType(),
                        d.getDescription()))
                .toList();

        return new Bootstrap(
                myBlocks.stream().map(BootstrapController::toDto).toList(),
                myStudents.stream()
                        .map(s -> new StudentDto(s.getId(), s.getDocumentId(), s.fullName(), s.getGrade()))
                        .toList(),
                dias);
    }
```

Anadir `CalendarService calendar` al constructor y los imports `java.time.LocalDate`, `java.time.ZoneId`, `co.edu.ggm.asistencia.calendar.CalendarController` y `co.edu.ggm.asistencia.calendar.CalendarService`.

- [ ] **Step 3: Anadir el test de contrato a `BootstrapTest`**

Este test es el que impide que A y B se desincronicen: compara la respuesta real con las claves del fixture que B esta usando.

```java
    @Test
    void la_respuesta_cumple_el_contrato_del_fixture() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        String json = mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDocente()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        var real = mapper.readTree(json);
        var fixture = mapper.readTree(new java.io.File("../contracts/fixtures/bootstrap.json"));

        assertThat(campos(real)).containsExactlyInAnyOrderElementsOf(campos(fixture));
        assertThat(campos(real.get("blocks").get(0)))
                .containsExactlyInAnyOrderElementsOf(campos(fixture.get("blocks").get(0)));
        assertThat(campos(real.get("students").get(0)))
                .containsExactlyInAnyOrderElementsOf(campos(fixture.get("students").get(0)));
        assertThat(campos(real.get("schoolDays").get(0))).contains("calendarDate", "dayType");
    }

    private static java.util.List<String> campos(com.fasterxml.jackson.databind.JsonNode nodo) {
        var nombres = new java.util.ArrayList<String>();
        nodo.fieldNames().forEachRemaining(nombres::add);
        return nombres;
    }
```

- [ ] **Step 4: Ejecutar los tests**

Run: `cd backend && ./mvnw test -Dtest=BootstrapTest`
Expected: PASS. Si el test de contrato falla, **no se arregla el test**: o se corrige la respuesta, o se cambia el fixture avisando a los otros dos tracks en `docs/ESTADO.md`.

- [ ] **Step 5: Anotar y commitear**

```bash
echo '- [A3] hecho — /api/sync/bootstrap incluye schoolDays; contrato verificado' >> docs/ESTADO.md
git add backend docs && git commit -m "feat: paquete de arranque con horario, estudiantes y calendario"
```

---

### Task A4: Sincronizacion idempotente con validacion de calendario

**Files:**
- Los de la Task 5 de v1, mas: Modify `backend/src/main/java/co/edu/ggm/asistencia/attendance/SyncService.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/attendance/SyncTest.java`

**Interfaces:**
- Consumes: Task A2 (`CalendarService.isSchoolDay`), Task A3.
- Produces: `POST /api/attendance/sync` y `GET /api/attendance?blockId=&date=` segun contrato.

Regla nueva y no negociable: **una asistencia en un dia no lectivo se rechaza**, con `reason` = `"La fecha no es un dia lectivo"`. Se valida en el servidor aunque la interfaz ya lo bloquee: el telefono de un docente puede llevar semanas con un calendario viejo; el servidor nunca.

- [ ] **Step 1: Ejecutar la Task 5 de v1, Steps 1 a 6**

Incluye el `updateExisting` + `insertIfAbsent` corregido (no el `ON CONFLICT` unico, que chocaba a la vez contra la clave primaria y contra `attendance_unique_slot`).

- [ ] **Step 2: Anadir la validacion de calendario a `SyncService`**

```java
@Service
public class SyncService {

    private static final Set<String> ESTADOS = Set.of("P", "T", "F", "E");

    private final AttendanceRepository repo;
    private final CalendarService calendar;

    public SyncService(AttendanceRepository repo, CalendarService calendar) {
        this.repo = repo; this.calendar = calendar;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void save(UUID id, Long studentId, Long blockId, LocalDate classDate,
                     String status, String comment, Long recordedBy, Instant recordedAt) {
        if (!ESTADOS.contains(status)) {
            throw new IllegalArgumentException("Estado invalido: " + status);
        }
        if (!calendar.isSchoolDay(classDate)) {
            throw new IllegalArgumentException("La fecha no es un dia lectivo");
        }
        String limpio = (comment == null || comment.isBlank()) ? null : comment.trim();
        int actualizadas = repo.updateExisting(studentId, blockId, classDate, status,
                limpio, recordedBy, recordedAt);
        if (actualizadas == 0) {
            repo.insertIfAbsent(id, studentId, blockId, classDate, status,
                    limpio, recordedBy, recordedAt);
        }
    }
}
```

Anadir el import `co.edu.ggm.asistencia.calendar.CalendarService`.

- [ ] **Step 3: Anadir los tests de la regla de calendario a `SyncTest`**

Las fechas de los tests de v1 (`2026-04-06`, `2026-04-07`, `2026-04-08`) son lunes, martes y miercoles lectivos, asi que siguen pasando sin tocarlas.

```java
    @Test
    void una_asistencia_en_festivo_se_rechaza_con_motivo_claro() throws Exception {
        // 2026-07-20 es festivo nacional (Independencia)
        String cuerpo = lote("99999999-9999-4999-8999-999999999999",
                             studentId("1010101010"), "P", "2026-07-20");
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(0))
           .andExpect(jsonPath("$.rejected[0].reason").value("La fecha no es un dia lectivo"));
    }

    @Test
    void una_asistencia_en_domingo_se_rechaza() throws Exception {
        String cuerpo = lote("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                             studentId("1010101010"), "P", "2026-07-19");
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(0));
    }
```

- [ ] **Step 4: Ejecutar toda la suite del track**

Run: `cd backend && ./mvnw test`
Expected: PASS todo.

- [ ] **Step 5: Anotar, commitear y publicar el track**

```bash
echo '- [A4] hecho — sync valida dia lectivo; TRACK A COMPLETO' >> docs/ESTADO.md
git add backend docs && git commit -m "feat: sincronizacion idempotente con validacion de dia lectivo"
# push deshabilitado: el remoto es ajeno. Solo commits locales.
```

---

# TRACK B — App del docente (terminal 2, rama `track-b-app`)

PWA offline-first: login, toma de asistencia con calendario, escaneo del carnet e instalacion en el telefono. **No espera a Track A**: trabaja contra el mock de contrato de la Task B1.

### Task B1: Cliente HTTP, login y modo mock del contrato

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/mock.ts`
- Create: `frontend/src/pages/Login.tsx` (reemplaza el marcador)
- Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- Consumes: `contract.ts` y los fixtures (Task 0.3).
- Produces: `api.login`, `api.get`, `api.post`, `getSession`, `clearSession`, `OfflineError`.

El modo mock es lo que desbloquea el paralelismo: con `VITE_MOCK=1`, `fetch` se intercepta y responde con los fixtures del contrato. Son ~40 lineas y evitan que dos personas se queden esperando a la tercera. Cuando Track A entre a `main`, se apaga la bandera y no cambia ni una linea de las paginas.

- [ ] **Step 1: Ejecutar la Task 6 de v1, Steps 5 a 9**

Eso deja `client.ts`, su test y `Login.tsx`. Saltar los Steps 1 a 4 y 10 y 11 (ya los hizo la Fase 0). Ajustar el tipo `Session` para que se importe de `./contract` en vez de declararlo:

```ts
import type { Session } from './contract';
export type { Session };
```

- [ ] **Step 2: Escribir `frontend/src/api/mock.ts`**

```ts
import bootstrap from '../../../contracts/fixtures/bootstrap.json';
import summary from '../../../contracts/fixtures/summary.json';
import dashboard from '../../../contracts/fixtures/dashboard.json';

const RUTAS: [RegExp, unknown][] = [
  [/\/api\/auth\/(login|refresh)$/, {
    token: 'mock', refreshToken: 'mock', role: 'DOCENTE',
    fullName: 'Francisco Palacios', userId: 3,
  }],
  [/\/api\/sync\/bootstrap$/, bootstrap],
  [/\/api\/schedule\/mine$/, bootstrap.blocks],
  [/\/api\/reports\/summary/, summary],
  [/\/api\/reports\/dashboard/, dashboard],
  [/\/api\/attendance\/sync$/, { accepted: 99, rejected: [] }],
  [/\/api\/entry\/sync$/, { accepted: 1, rejected: [], names: {} }],
  [/\/api\/attendance/, []],
  [/\/api\/reports\/pending-today$/, []],
  [/\/api\/guardian\/children$/, []],
];

/** Intercepta fetch y responde con los fixtures del contrato. Solo con VITE_MOCK=1. */
export function instalarMock() {
  const real = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const match = RUTAS.find(([patron]) => patron.test(url));
    if (!match) return real(input, init);
    console.info('[mock]', url);
    await new Promise((r) => setTimeout(r, 120));   // latencia de mentira, util para ver spinners
    return new Response(JSON.stringify(match[1]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
}
```

Activarlo en `main.tsx` **sin tocar el fichero congelado**: la Fase 0 ya dejo la linea. Si no la dejo, es un cambio de la Fase 0 y se anota en `docs/ESTADO.md`. La linea es:

```ts
if (import.meta.env.VITE_MOCK) { await import('./api/mock').then((m) => m.instalarMock()); }
```

Y se usa asi: `VITE_MOCK=1 npm run dev`.

- [ ] **Step 3: Anadir a `tsconfig.json` la lectura de JSON**

```json
    "resolveJsonModule": true,
```

- [ ] **Step 4: Ejecutar los tests**

Run: `cd frontend && npm test`
Expected: PASS los dos de `client.test.ts`.

- [ ] **Step 5: Anotar y commitear**

```bash
echo '- [B1] hecho — cliente HTTP, login y modo mock (VITE_MOCK=1)' >> docs/ESTADO.md
git add frontend docs && git commit -m "feat: cliente HTTP con refresco de token, login y mock del contrato"
```

---

### Task B2: Base local y motor de sincronizacion con calendario

**Files:**
- Create: `frontend/src/db/local.ts`
- Create: `frontend/src/sync/engine.ts`
- Test: `frontend/src/sync/engine.test.ts`

**Interfaces:**
- Consumes: Task B1, contrato.
- Produces: `markAttendance`, `flushOutbox`, `downloadBootstrap`, `pendingCount`, `startAutoSync` y **`isSchoolDay(fecha)`** desde la base local.

Cambio respecto a v1: la base local guarda tambien los dias del calendario, y **`markAttendance` se niega a registrar en un dia no lectivo**. Es la misma regla que aplica el servidor, aplicada antes de gastar bateria y datos.

- [ ] **Step 1: Escribir `src/db/local.ts` con la tabla de calendario**

```ts
import Dexie, { type Table } from 'dexie';
import type { Block, StudentDto, SchoolDay, Status } from '../api/contract';

export type OutboxRecord = {
  key: string;              // `${studentId}:${blockId}:${classDate}` — evita duplicados locales
  id: string;               // UUID que viaja al servidor
  studentId: number;
  scheduleBlockId: number;
  classDate: string;        // YYYY-MM-DD
  status: Status;
  comment?: string;
  recordedAt: string;       // ISO-8601 con offset
  error?: string;
};

export type OutboxEntry = {
  id: string; documentId: string; scannedAt: string; name?: string; error?: string;
};

class LocalDb extends Dexie {
  blocks!: Table<Block, number>;
  students!: Table<StudentDto, number>;
  schoolDays!: Table<SchoolDay, string>;
  outbox!: Table<OutboxRecord, string>;
  entryOutbox!: Table<OutboxEntry, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super('ggm-asistencia');
    this.version(1).stores({
      blocks: 'id, grade, weekday',
      students: 'id, grade, documentId',
      schoolDays: 'calendarDate, dayType',
      outbox: 'key, classDate, error',
      entryOutbox: 'id, scannedAt, error',
      meta: 'key',
    });
  }
}

export const db = new LocalDb();

/** Un dia es lectivo solo si el calendario descargado lo dice. Sin calendario, no se asume nada. */
export async function isSchoolDay(fecha: string): Promise<boolean> {
  const dia = await db.schoolDays.get(fecha);
  return dia?.dayType === 'LECTIVO';
}
```

- [ ] **Step 2: Escribir el test del motor (falla)**

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/local';
import { markAttendance, flushOutbox, pendingCount, downloadBootstrap } from './engine';

const base = { studentId: 1, scheduleBlockId: 7, classDate: '2026-07-13' } as const;

describe('motor de sincronizacion', () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.schoolDays.clear();
    await db.schoolDays.bulkPut([
      { calendarDate: '2026-07-13', dayType: 'LECTIVO' },
      { calendarDate: '2026-07-20', dayType: 'FESTIVO' },
    ]);
    vi.unstubAllGlobals();
  });

  it('marcar asistencia sin red no falla y deja el registro pendiente', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await markAttendance({ ...base, status: 'P' });
    expect(await pendingCount()).toBe(1);
  });

  it('rechaza marcar en un dia no lectivo antes de gastar red', async () => {
    await expect(markAttendance({ ...base, classDate: '2026-07-20', status: 'P' }))
      .rejects.toThrow('no es un dia lectivo');
    expect(await pendingCount()).toBe(0);
  });

  it('rechaza marcar en una fecha que no esta en el calendario descargado', async () => {
    await expect(markAttendance({ ...base, classDate: '2027-01-04', status: 'P' }))
      .rejects.toThrow('no es un dia lectivo');
  });

  it('remarcar al mismo estudiante reemplaza la entrada y conserva el uuid', async () => {
    await markAttendance({ ...base, status: 'P' });
    const primero = (await db.outbox.toArray())[0].id;
    await markAttendance({ ...base, status: 'T' });
    expect(await pendingCount()).toBe(1);
    const [solo] = await db.outbox.toArray();
    expect(solo.status).toBe('T');
    expect(solo.id).toBe(primero);
  });

  it('flush borra lo aceptado y conserva lo rechazado con su motivo', async () => {
    await markAttendance({ ...base, status: 'P' });
    await markAttendance({ ...base, studentId: 2, status: 'F' });
    const rechazado = (await db.outbox.toArray()).find((r) => r.studentId === 2)!;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ accepted: 1, rejected: [{ id: rechazado.id, reason: 'Estudiante inexistente' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const res = await flushOutbox();

    expect(res.sent).toBe(1);
    const quedan = await db.outbox.toArray();
    expect(quedan).toHaveLength(1);
    expect(quedan[0].error).toBe('Estudiante inexistente');
  });

  it('estando offline el flush no pierde nada', async () => {
    await markAttendance({ ...base, status: 'P' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    const res = await flushOutbox();
    expect(res.sent).toBe(0);
    expect(await pendingCount()).toBe(1);
  });

  it('el bootstrap guarda tambien el calendario', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      blocks: [], students: [],
      schoolDays: [{ calendarDate: '2026-08-10', dayType: 'LECTIVO' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await downloadBootstrap();
    expect((await db.schoolDays.get('2026-08-10'))?.dayType).toBe('LECTIVO');
  });
});
```

- [ ] **Step 3: Ejecutar — debe fallar**

Run: `cd frontend && npm test`
Expected: FAIL, `./engine` no existe.

- [ ] **Step 4: Escribir `src/sync/engine.ts`**

Es el de la Task 7 de v1, Step 4, con tres cambios: la guarda de calendario en `markAttendance`, el guardado de `schoolDays` en `downloadBootstrap` y los tipos importados del contrato.

```ts
import { api, OfflineError } from '../api/client';
import type { Bootstrap, Status } from '../api/contract';
import { db, isSchoolDay } from '../db/local';

type Mark = {
  studentId: number;
  scheduleBlockId: number;
  classDate: string;
  status: Status;
  comment?: string;
};

const keyOf = (m: Mark) => `${m.studentId}:${m.scheduleBlockId}:${m.classDate}`;

/**
 * Escritura puramente local: nunca toca la red, el docente esta en el salon sin senal.
 * Lanza si la fecha no es lectiva — la misma regla del servidor, aplicada antes de gastar bateria.
 */
export async function markAttendance(mark: Mark): Promise<void> {
  if (!(await isSchoolDay(mark.classDate))) {
    throw new Error(`${mark.classDate} no es un dia lectivo`);
  }
  const key = keyOf(mark);
  const previo = await db.outbox.get(key);
  await db.outbox.put({
    key,
    id: previo?.id ?? crypto.randomUUID(),
    ...mark,
    recordedAt: new Date().toISOString(),
    error: undefined,
  });
}

export const pendingCount = () => db.outbox.count();

export async function flushOutbox(): Promise<{ sent: number; pending: number }> {
  const records = await db.outbox.toArray();
  if (records.length === 0) return { sent: 0, pending: 0 };

  let result: { accepted: number; rejected: { id: string; reason: string }[] };
  try {
    result = await api.post('/api/attendance/sync', {
      records: records.map(({ key, error, ...r }) => r),
    });
  } catch (e) {
    if (e instanceof OfflineError) return { sent: 0, pending: records.length };
    throw e;
  }

  const rechazados = new Map(result.rejected.map((r) => [r.id, r.reason]));
  await db.transaction('rw', db.outbox, async () => {
    for (const r of records) {
      const motivo = rechazados.get(r.id);
      if (motivo) await db.outbox.update(r.key, { error: motivo });
      else await db.outbox.delete(r.key);
    }
  });

  return { sent: result.accepted, pending: await pendingCount() };
}

export async function downloadBootstrap(): Promise<void> {
  const data = await api.get<Bootstrap>('/api/sync/bootstrap');
  await db.transaction('rw', db.blocks, db.students, db.schoolDays, db.meta, async () => {
    await db.blocks.clear();
    await db.blocks.bulkPut(data.blocks);
    await db.students.clear();
    await db.students.bulkPut(data.students);
    // El calendario se fusiona, no se limpia: el servidor baja una ventana de cuatro
    // meses y un clear perderia dias validos ya descargados.
    await db.schoolDays.bulkPut(data.schoolDays);
    await db.meta.put({ key: 'lastBootstrap', value: new Date().toISOString() });
  });
}

/** Intenta vaciar el outbox cuando el navegador recupera la conexion. */
export function startAutoSync(onChange?: (pending: number) => void) {
  const intentar = async () => {
    const { pending } = await flushOutbox().catch(() => ({ pending: -1 }));
    if (pending >= 0) onChange?.(pending);
  };
  window.addEventListener('online', intentar);
  const timer = window.setInterval(intentar, 60_000);
  void intentar();
  return () => {
    window.removeEventListener('online', intentar);
    window.clearInterval(timer);
  };
}
```

- [ ] **Step 5: Ejecutar los tests**

Run: `cd frontend && npm test`
Expected: PASS los siete del motor mas los dos del cliente.

- [ ] **Step 6: Anotar y commitear**

```bash
echo '- [B2] hecho — IndexedDB con calendario; markAttendance bloquea dias no lectivos' >> docs/ESTADO.md
git add frontend docs && git commit -m "feat: base local con calendario y motor de sincronizacion"
```

---

### Task B3: Pantalla de toma de asistencia consciente del calendario

**Files:**
- Create: `frontend/src/pages/TomarAsistencia.tsx` (reemplaza el marcador)
- Create: `frontend/src/pages/Home.tsx` (reemplaza el marcador)
- Create: `frontend/src/components/BannerEstado.tsx`
- Create: `frontend/src/components/SelectorFecha.tsx`

**Interfaces:**
- Consumes: Task B2.
- Produces: ruta `/asistencia` operativa sin conexion.

- [ ] **Step 1: Ejecutar la Task 8 de v1, Steps 1 a 4**

Eso deja `BannerEstado.tsx`, `TomarAsistencia.tsx` y `Home.tsx`. Saltar los Steps 5 y 7 (los estilos y `App.tsx` estan congelados desde la Fase 0).

- [ ] **Step 2: Escribir `src/components/SelectorFecha.tsx`**

`<input type="date">` nativo no sabe deshabilitar fechas sueltas, y un calendario a medida seria mucho codigo para el problema. La solucion corta: el input nativo mas un aviso claro y la lista bloqueada cuando la fecha no es lectiva, mas atajos a los ultimos dias lectivos, que es como se usa el 95 % de las veces.

```tsx
import { useEffect, useState } from 'react';
import { db } from '../db/local';
import type { SchoolDay } from '../api/contract';

const ETIQUETA_TIPO: Record<string, string> = {
  FESTIVO: 'festivo', VACACIONES: 'vacaciones',
  INSTITUCIONAL: 'jornada institucional', SUSPENDIDO: 'dia suspendido',
};

type Props = { valor: string; onChange: (fecha: string) => void; max: string };

export default function SelectorFecha({ valor, onChange, max }: Props) {
  const [dia, setDia] = useState<SchoolDay | undefined>();
  const [recientes, setRecientes] = useState<string[]>([]);

  useEffect(() => { void db.schoolDays.get(valor).then(setDia); }, [valor]);

  useEffect(() => {
    void db.schoolDays.where('dayType').equals('LECTIVO').toArray().then((dias) => {
      setRecientes(dias.map((d) => d.calendarDate).filter((d) => d <= max).sort().slice(-5).reverse());
    });
  }, [max]);

  const lectivo = dia?.dayType === 'LECTIVO';

  return (
    <>
      <label htmlFor="fecha">Fecha</label>
      <div>
        <input id="fecha" type="date" value={valor} max={max}
               onChange={(e) => onChange(e.target.value)} />
        <div className="leyenda">
          {recientes.map((d) => (
            <button key={d} type="button" className="secundario"
                    style={{ minHeight: 32, padding: '4px 10px' }}
                    onClick={() => onChange(d)}>
              {new Date(`${d}T00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
            </button>
          ))}
        </div>
      </div>
      {!lectivo && (
        <p role="alert" className="banner no-lectivo" style={{ gridColumn: '1 / -1' }}>
          {dia
            ? `El ${new Date(`${valor}T00:00`).toLocaleDateString('es-CO')} es ${ETIQUETA_TIPO[dia.dayType] ?? 'no lectivo'}`
              + (dia.description ? ` (${dia.description}).` : '.') + ' No se toma asistencia.'
            : 'Esa fecha no esta en el calendario descargado. Actualice los datos con conexion.'}
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 3: Conectar el selector en `TomarAsistencia.tsx`**

Tres cambios sobre lo que dejo el Step 1:

1. Sustituir el `<label htmlFor="fecha">` y su `<input type="date">` dentro de `.filtros` por `<SelectorFecha valor={fecha} onChange={setFecha} max={hoyISO()} />`.
2. Anadir el estado `const [lectivo, setLectivo] = useState(true);` y el efecto que lo mantiene:

```tsx
useEffect(() => { void isSchoolDay(fecha).then(setLectivo); }, [fecha]);
```

3. Condicionar la lista y el envio:

```tsx
{!lectivo
  ? <p className="meta">Elija un dia lectivo para tomar asistencia.</p>
  : blockId === null
    ? <p>Elija curso y bloque para tomar la asistencia.</p>
    : ( /* la lista de estudiantes tal como quedo en el Step 1 */ )}
```

y en el boton de guardar: `disabled={pendientes === 0 || !lectivo}`.

Envolver la llamada a `markAttendance` en `try/catch` para mostrar el motivo si el motor la rechaza:

```tsx
  async function marcar(studentId: number, status: Estado) {
    if (!blockId) return;
    try {
      await markAttendance({ studentId, scheduleBlockId: blockId, classDate: fecha, status });
      setMarcas((prev) => ({ ...prev, [studentId]: status }));
      setPendientes(await pendingCount());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar');
    }
  }
```

Anadir los imports `SelectorFecha`, `isSchoolDay` y el estado `const [error, setError] = useState('');` con su `{error && <p role="alert" className="error">{error}</p>}`.

- [ ] **Step 4: Verificar a mano en modo mock**

Run: `cd frontend && VITE_MOCK=1 npm run dev`
Comprobar:
1. Login con cualquier credencial (el mock acepta todo).
2. "Actualizar datos" trae el curso 601 y el calendario del fixture.
3. Con fecha `2026-07-13` (lectivo) la lista aparece y se puede marcar.
4. Con fecha `2026-07-20` (festivo) sale el aviso y la lista desaparece.
5. DevTools > Network > Offline: se sigue marcando, el banner naranja aparece, nada falla.

- [ ] **Step 5: Anotar y commitear**

```bash
echo '- [B3] hecho — pantalla de asistencia con selector de fecha y bloqueo de no lectivos' >> docs/ESTADO.md
git add frontend docs && git commit -m "feat: toma de asistencia con calendario y estados P/T/F/E"
```

---

### Task B4: PWA instalable y escaneo del carnet

**Files:**
- Modify: `frontend/vite.config.ts`
- Create: `frontend/public/icon-192.png`, `icon-512.png`
- Create: `frontend/src/components/BotonInstalar.tsx`
- Create: `frontend/src/scan/scanner.ts`
- Create: `frontend/src/pages/Ingreso.tsx` (reemplaza el marcador)

**Interfaces:**
- Consumes: Tasks B1-B3; `POST /api/entry/sync` (lo implementa Track C, mockeado mientras tanto).
- Produces: app instalable en el telefono y pantalla de ingreso por QR.

**El codigo que se escanea es el numero de tarjeta de identidad impreso en el carnet.** No se genera ninguno: se busca `documentId` en la base local y, si no aparece, se avisa. Un carnet que no reconoce es un problema de datos, no de codigo.

- [ ] **Step 1: Ejecutar la Task 9 de v1 completa (PWA)**

Steps 1 a 7. En el Step 3, `index.html` esta congelado desde la Fase 0: si le faltan las etiquetas del manifest, es un cambio de Fase 0 y se anota en `docs/ESTADO.md`.

- [ ] **Step 2: Ejecutar la Task 10 de v1, Steps 7, 9 y 11**

Step 7 (`scanner.ts` con `BarcodeDetector` nativo y respaldo `@zxing/browser` cargado bajo demanda), Step 9 (`Ingreso.tsx`) y Step 11 (prueba en telefono real con HTTPS). Saltar los Steps 1 a 6, 8, 10 y 12: el backend del ingreso lo hace Track C, la tabla `entryOutbox` ya la creo la Task B2 y la ruta ya esta en `App.tsx`.

- [ ] **Step 3: Verificar el arranque sin red**

Run: `cd frontend && npm run build && npm run preview`
Comprobar en DevTools > Application: manifest sin errores, service worker activo, y con **Offline** marcado la app recarga y sigue funcionando. Bundle JS gzip por debajo de 200 KB.

- [ ] **Step 4: Anotar, commitear y publicar el track**

```bash
echo '- [B4] hecho — PWA instalable y escaneo de carnet; TRACK B COMPLETO' >> docs/ESTADO.md
git add frontend docs && git commit -m "feat: PWA instalable y registro de ingreso por QR del carnet"
# push deshabilitado: el remoto es ajeno. Solo commits locales.
```

---

# TRACK C — Analitica (terminal 3, rama `track-c-analitica`)

Ingreso al colegio, reportes, dashboard, notificaciones, portal del acudiente e importacion. Trabaja contra el esquema de la Fase 0 y los fixtures; **no espera a Track A**.

### Task C1: Backend de ingreso, reportes y dashboard

**Files:**
- Create: `backend/src/main/java/co/edu/ggm/asistencia/entry/` (EntryLog, EntryRepository, EntryController)
- Create: `backend/src/main/java/co/edu/ggm/asistencia/report/` (ReportRepository, ExcelReportService, DashboardService, ReportController)
- Test: `backend/src/test/java/co/edu/ggm/asistencia/entry/EntryTest.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/report/ReportTest.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/report/DashboardTest.java`

**Interfaces:**
- Consumes: esquema de la Fase 0; `JwtService` de Track A (**dependencia real**: mientras A no fusione, este track compila su propia copia minima o espera a A1, que es la primera tarea de A y dura poco).
- Produces: `/api/entry/sync`, `/api/reports/summary`, `/api/reports/excel`, `/api/reports/pending-today`, `/api/reports/dashboard`.

> **Unica dependencia dura entre tracks.** `JwtService` sale de la Task A1. Como A1 es la primera tarea del Track A y no dura mas de una sesion, lo practico es: Track C empieza por la Task C2 (dashboard en el frontend contra el fixture, cero backend) y vuelve a C1 cuando A1 este en `main`. Esta anotado asi en `docs/ESTADO.md`.

- [ ] **Step 1: Ejecutar la Task 10 de v1, Steps 1 a 5** (backend del ingreso por QR)

- [ ] **Step 2: Ejecutar la Task 11 de v1, Steps 2 a 7**, con un cambio en `ReportRepository.summary`

El resumen ahora incluye `schoolDays` (dias lectivos del rango), porque un porcentaje de asistencia sin el denominador correcto no significa nada: 18 presentes es excelente sobre 20 dias y pesimo sobre 40. Sustituir la consulta `summary` por:

```java
    @Query(value = """
            SELECT s.id AS studentId,
                   s.document_id AS documentId,
                   trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
                        s.last_name, s.second_surname), '\s+', ' ', 'g')) AS fullName,
                   s.grade AS grade,
                   count(*) FILTER (WHERE a.status = 'P') AS present,
                   count(*) FILTER (WHERE a.status = 'T') AS late,
                   count(*) FILTER (WHERE a.status = 'F') AS absent,
                   count(*) FILTER (WHERE a.status = 'E') AS evasion,
                   (SELECT count(*) FROM school_calendar c
                     WHERE c.day_type = 'LECTIVO'
                       AND c.calendar_date BETWEEN :from AND :to) AS schoolDays
            FROM students s
            LEFT JOIN attendance a ON a.student_id = s.id AND a.class_date BETWEEN :from AND :to
            WHERE s.active AND (:grade IS NULL OR s.grade = :grade)
            GROUP BY s.id, s.document_id, s.first_name, s.middle_name,
                     s.last_name, s.second_surname, s.grade
            ORDER BY s.grade, s.last_name, s.first_name
            """, nativeQuery = true)
    List<Row> summary(@Param("grade") String grade,
                      @Param("from") LocalDate from,
                      @Param("to") LocalDate to);
```

Anadir `int getSchoolDays();` a la interfaz `Row` y la columna "Dias lectivos" al Excel, entre "Curso" y "Presente".

- [ ] **Step 3: Escribir el test del dashboard (falla)**

```java
package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.config.JwtService;
import co.edu.ggm.asistencia.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class DashboardTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    private String tokenCoord() {
        var u = users.findByEmailAndActiveTrue("coord@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "COORDINADOR");
    }

    @BeforeEach
    void datos() {
        jdbc.update("DELETE FROM attendance");
        // 3 presentes y 1 falta el mismo dia lectivo => 75 % de asistencia
        jdbc.update("""
            INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
            SELECT gen_random_uuid(), s.id, b.id, DATE '2026-07-13', x.estado, u.id, now()
            FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM students) s
            CROSS JOIN (SELECT id FROM schedule_blocks LIMIT 1) b
            CROSS JOIN users u
            JOIN (VALUES (1,'P'),(2,'P'),(3,'F')) AS x(n, estado) ON x.n = s.n
            WHERE u.email = 'coord@ggm.edu.co'
            """);
    }

    @Test
    void el_dashboard_calcula_la_tasa_de_asistencia_y_agrupa_por_curso() throws Exception {
        mvc.perform(get("/api/reports/dashboard")
                        .param("from", "2026-07-13").param("to", "2026-07-13")
                        .header("Authorization", tokenCoord()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.kpi.attendanceRate").value(66.7))
           .andExpect(jsonPath("$.kpi.schoolDays").value(1))
           .andExpect(jsonPath("$.byGrade.length()").value(2))
           .andExpect(jsonPath("$.trend.length()").value(1))
           .andExpect(jsonPath("$.trend[0].classDate").value("2026-07-13"));
    }

    @Test
    void un_docente_no_puede_ver_el_dashboard_del_colegio() throws Exception {
        mvc.perform(get("/api/reports/dashboard")
                        .param("from", "2026-07-13").param("to", "2026-07-13")
                        .header("Authorization", "Bearer " + jwt.issueAccess(1L, "DOCENTE")))
           .andExpect(status().isForbidden());
    }

    @Test
    void un_rango_sin_datos_devuelve_ceros_y_no_revienta() throws Exception {
        mvc.perform(get("/api/reports/dashboard")
                        .param("from", "2026-02-02").param("to", "2026-02-06")
                        .header("Authorization", tokenCoord()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.kpi.attendanceRate").value(0.0))
           .andExpect(jsonPath("$.byGrade.length()").value(0));
    }
}
```

El `66.7` del primer test no es capricho: de tres estudiantes, dos presentes y uno con falta dan 2/3. El test fija ademas el redondeo a un decimal, que es el que consume el frontend.

- [ ] **Step 4: Ejecutar — debe fallar**

Run: `cd backend && ./mvnw test -Dtest=DashboardTest`
Expected: FAIL con 404.

- [ ] **Step 5: Anadir las consultas del dashboard a `ReportRepository`**

Todo agregado en SQL. Con 1,37 M de filas al ano, `count(*) FILTER` en Postgres tarda milisegundos; traerlas a Java para contarlas en un bucle seria el error clasico.

```java
    interface GradeRow {
        String getGrade();
        int getPresent();
        int getLate();
        int getAbsent();
        int getEvasion();
    }

    @Query(value = """
            SELECT s.grade AS grade,
                   count(*) FILTER (WHERE a.status = 'P') AS present,
                   count(*) FILTER (WHERE a.status = 'T') AS late,
                   count(*) FILTER (WHERE a.status = 'F') AS absent,
                   count(*) FILTER (WHERE a.status = 'E') AS evasion
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            WHERE a.class_date BETWEEN :from AND :to
              AND (:grade IS NULL OR s.grade = :grade)
            GROUP BY s.grade
            ORDER BY s.grade
            """, nativeQuery = true)
    List<GradeRow> byGrade(@Param("grade") String grade,
                           @Param("from") LocalDate from,
                           @Param("to") LocalDate to);

    interface TrendRow {
        LocalDate getClassDate();
        double getAttendanceRate();
    }

    @Query(value = """
            SELECT a.class_date AS classDate,
                   round(100.0 * count(*) FILTER (WHERE a.status IN ('P','T')) / count(*), 1)
                     AS attendanceRate
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            WHERE a.class_date BETWEEN :from AND :to
              AND (:grade IS NULL OR s.grade = :grade)
            GROUP BY a.class_date
            ORDER BY a.class_date
            """, nativeQuery = true)
    List<TrendRow> trend(@Param("grade") String grade,
                         @Param("from") LocalDate from,
                         @Param("to") LocalDate to);

    @Query(value = """
            SELECT count(*) FROM school_calendar
            WHERE day_type = 'LECTIVO' AND calendar_date BETWEEN :from AND :to
            """, nativeQuery = true)
    int countSchoolDays(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query(value = """
            SELECT count(DISTINCT a.student_id) FROM attendance a
            WHERE a.class_date = :day AND a.status = 'F'
            """, nativeQuery = true)
    int countAbsentOn(@Param("day") LocalDate day);

    @Query(value = """
            SELECT count(*) FROM attendance a
            WHERE a.status = 'E' AND a.class_date BETWEEN :from AND :to
            """, nativeQuery = true)
    int countEvasions(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query(value = """
            SELECT count(*) FROM schedule_blocks b
            WHERE b.weekday = :weekday
              AND NOT EXISTS (SELECT 1 FROM attendance a
                              WHERE a.schedule_block_id = b.id AND a.class_date = :day)
            """, nativeQuery = true)
    int countBlocksPending(@Param("weekday") int weekday, @Param("day") LocalDate day);
```

- [ ] **Step 6: Escribir `DashboardService`**

```java
package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.calendar.CalendarService;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

@Service
public class DashboardService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final ReportRepository repo;
    private final CalendarService calendar;

    public DashboardService(ReportRepository repo, CalendarService calendar) {
        this.repo = repo; this.calendar = calendar;
    }

    public record Kpi(double attendanceRate, int absentToday, int evasionsWeek,
                      int blocksPending, int schoolDays) {}
    public record GradeDto(String grade, int present, int late, int absent, int evasion) {}
    public record TrendDto(LocalDate classDate, double attendanceRate) {}
    public record Dashboard(Kpi kpi, List<GradeDto> byGrade, List<TrendDto> trend) {}

    public Dashboard build(String grade, LocalDate from, LocalDate to) {
        List<GradeDto> porCurso = repo.byGrade(grade, from, to).stream()
                .map(r -> new GradeDto(r.getGrade(), r.getPresent(), r.getLate(),
                        r.getAbsent(), r.getEvasion()))
                .toList();

        int presentes = porCurso.stream().mapToInt(g -> g.present() + g.late()).sum();
        int total = porCurso.stream()
                .mapToInt(g -> g.present() + g.late() + g.absent() + g.evasion()).sum();
        double tasa = total == 0 ? 0.0 : Math.round(1000.0 * presentes / total) / 10.0;

        LocalDate hoy = LocalDate.now(BOGOTA);
        // Si hoy no es lectivo, no hay bloques "pendientes" que reclamar.
        int pendientes = calendar.isSchoolDay(hoy)
                ? repo.countBlocksPending(hoy.getDayOfWeek().getValue(), hoy)
                : 0;

        var kpi = new Kpi(tasa,
                repo.countAbsentOn(hoy),
                repo.countEvasions(hoy.minusDays(6), hoy),
                pendientes,
                repo.countSchoolDays(from, to));

        List<TrendDto> tendencia = repo.trend(grade, from, to).stream()
                .map(r -> new TrendDto(r.getClassDate(), r.getAttendanceRate()))
                .toList();

        return new Dashboard(kpi, porCurso, tendencia);
    }
}
```

- [ ] **Step 7: Anadir el endpoint a `ReportController`**

```java
    @GetMapping("/dashboard")
    @PreAuthorize("hasAnyRole('COORDINADOR','ADMIN')")
    public DashboardService.Dashboard dashboard(
            @RequestParam(required = false) String grade,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return dashboardService.build(grade, from, to);
    }
```

Anadir `DashboardService dashboardService` al constructor. Ojo: el `@PreAuthorize` de la clase permite `DOCENTE`; el de este metodo lo restringe mas, y el mas restrictivo es el que aplica — es justo lo que verifica el segundo test.

- [ ] **Step 8: Ejecutar los tests**

Run: `cd backend && ./mvnw test -Dtest='EntryTest,ReportTest,DashboardTest'`
Expected: PASS todos.

- [ ] **Step 9: Anotar y commitear**

```bash
echo '- [C1] hecho — ingreso, reportes, Excel y /api/reports/dashboard' >> docs/ESTADO.md
git add backend docs && git commit -m "feat: backend de ingreso, reportes con dias lectivos y dashboard"
```

---

### Task C2: Dashboard con graficas en SVG

**Files:**
- Create: `frontend/src/components/charts/Kpi.tsx`
- Create: `frontend/src/components/charts/BarrasPorCurso.tsx`
- Create: `frontend/src/components/charts/LineaTendencia.tsx`
- Create: `frontend/src/pages/Dashboard.tsx` (reemplaza el marcador)
- Test: `frontend/src/components/charts/charts.test.ts`

**Interfaces:**
- Consumes: `contracts/fixtures/dashboard.json` (Task 0.3) y, cuando exista, `GET /api/reports/dashboard` (Task C1).
- Produces: ruta `/dashboard` para COORDINADOR y ADMIN.

**Esta tarea no necesita nada de Track A: es la primera que debe hacer Track C.** Contra el fixture se construye entero.

#### Decisiones de diseno (no son gusto, son reglas con motivo)

- **Sin libreria de graficas.** Recharts o Chart.js pesan 100-200 KB gzip, mas que todo el resto de la app junta, para dibujar dos figuras. SVG a mano son ~120 lineas. Con la conexion del colegio, la libreria seria el componente mas caro del proyecto.
- **Colores de estado, no una paleta categorica.** P/T/F/E son estados, no series: presente es "bueno", falta es "critico". Se usa la paleta de estado y **cada color va siempre acompanado de su letra y su etiqueta**, nunca solo.
- **El orden de apilado es P, T, F, E, y no se toca.** Es el unico orden de los cuatro colores que pasa las dos comprobaciones de separacion (daltonismo y vision normal) entre segmentos contiguos. El orden "natural" P, T, E, F pone amarillo junto a naranja: ΔE 13,6 sobre un minimo de 15, es decir, dos segmentos que ni con vision normal se distinguen bien. Cambiarlo "porque se ve mas logico" rompe la grafica para el 8 % de los hombres con daltonismo y para todos con mala luz.
- **Un solo eje por grafica.** Nunca dos escalas verticales. Si aparece la tentacion de meter "cantidad" y "porcentaje" en la misma figura, son dos figuras.
- **Hay vista de tabla.** Amarillo y naranja quedan por debajo de 3:1 contra el fondo claro; la compensacion obligatoria es que los numeros esten siempre disponibles en texto. El boton "Ver tabla" no es un extra, es parte de la accesibilidad.

- [ ] **Step 1: Escribir el test de la geometria (falla)**

Lo que se prueba es la matematica que produce la figura, no los pixeles. Un stack que no suma 100 % o un punto de la linea fuera del lienzo son bugs reales; el aspecto se revisa con los ojos en el Step 6.

```ts
import { describe, expect, it } from 'vitest';
import { segmentosApilados, puntosLinea } from './geometria';

describe('geometria de las graficas', () => {
  it('los segmentos apilados cubren exactamente el ancho disponible', () => {
    const segs = segmentosApilados({ present: 30, late: 10, absent: 8, evasion: 2 }, 200);
    expect(segs).toHaveLength(4);
    expect(segs[0].x).toBe(0);
    const ultimo = segs[3];
    expect(ultimo.x + ultimo.ancho).toBeCloseTo(200, 5);
  });

  it('mantiene el orden P, T, F, E', () => {
    const segs = segmentosApilados({ present: 1, late: 1, absent: 1, evasion: 1 }, 100);
    expect(segs.map((s) => s.estado)).toEqual(['P', 'T', 'F', 'E']);
  });

  it('un curso sin registros no dibuja nada en vez de dividir por cero', () => {
    const segs = segmentosApilados({ present: 0, late: 0, absent: 0, evasion: 0 }, 200);
    expect(segs).toEqual([]);
  });

  it('la linea escala los puntos dentro del lienzo', () => {
    const pts = puntosLinea([
      { classDate: '2026-07-06', attendanceRate: 90 },
      { classDate: '2026-07-07', attendanceRate: 100 },
      { classDate: '2026-07-08', attendanceRate: 80 },
    ], 300, 100);

    expect(pts[0].x).toBe(0);
    expect(pts[2].x).toBeCloseTo(300, 5);
    // 100 % es el punto mas alto => y minimo; 80 % el mas bajo => y maximo
    expect(pts[1].y).toBeLessThan(pts[0].y);
    expect(pts[2].y).toBe(100);
    pts.forEach((p) => { expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(100); });
  });

  it('un solo dia no revienta la escala', () => {
    const pts = puntosLinea([{ classDate: '2026-07-06', attendanceRate: 95 }], 300, 100);
    expect(pts).toHaveLength(1);
    expect(Number.isFinite(pts[0].x)).toBe(true);
    expect(Number.isFinite(pts[0].y)).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar — debe fallar**

Run: `cd frontend && npm test`
Expected: FAIL, `./geometria` no existe.

- [ ] **Step 3: Escribir `src/components/charts/geometria.ts`**

```ts
import type { GradeBreakdown } from '../../api/contract';

export type Segmento = { estado: 'P' | 'T' | 'F' | 'E'; x: number; ancho: number; valor: number };

const CLAVES = [
  ['P', 'present'], ['T', 'late'], ['F', 'absent'], ['E', 'evasion'],
] as const;

/** Reparte el ancho entre los cuatro estados en el orden validado P, T, F, E. */
export function segmentosApilados(
  datos: Pick<GradeBreakdown, 'present' | 'late' | 'absent' | 'evasion'>,
  ancho: number,
): Segmento[] {
  const total = datos.present + datos.late + datos.absent + datos.evasion;
  if (total === 0) return [];

  let x = 0;
  return CLAVES.map(([estado, clave]) => {
    const valor = datos[clave];
    const w = (valor / total) * ancho;
    const seg = { estado, x, ancho: w, valor };
    x += w;
    return seg;
  });
}

export type Punto = { x: number; y: number; fecha: string; valor: number };

/**
 * Escala la serie al lienzo. El eje Y no arranca en cero a proposito: en asistencia
 * todo vive entre 85 % y 100 % y un eje desde cero aplanaria la linea hasta volverla
 * inutil. Se compensa etiquetando siempre el minimo y el maximo del eje.
 */
export function puntosLinea(
  serie: { classDate: string; attendanceRate: number }[],
  ancho: number,
  alto: number,
): Punto[] {
  if (serie.length === 0) return [];

  const valores = serie.map((d) => d.attendanceRate);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;          // una sola fecha, o todas iguales
  const pasoX = serie.length === 1 ? 0 : ancho / (serie.length - 1);

  return serie.map((d, i) => ({
    x: pasoX * i,
    y: alto - ((d.attendanceRate - min) / rango) * alto,
    fecha: d.classDate,
    valor: d.attendanceRate,
  }));
}

export const dominioY = (serie: { attendanceRate: number }[]) => {
  const valores = serie.map((d) => d.attendanceRate);
  return valores.length ? { min: Math.min(...valores), max: Math.max(...valores) } : { min: 0, max: 100 };
};
```

- [ ] **Step 4: Ejecutar los tests**

Run: `cd frontend && npm test`
Expected: PASS los cinco.

- [ ] **Step 5: Escribir `Kpi.tsx` y `BarrasPorCurso.tsx`**

`src/components/charts/Kpi.tsx` — la cifra sola, sin grafica. Cuatro numeros no necesitan dibujo.

```tsx
type Props = { valor: string | number; etiqueta: string; sufijo?: string; alerta?: boolean };

export default function Kpi({ valor, etiqueta, sufijo, alerta }: Props) {
  return (
    <div className="kpi">
      <div className="valor" style={alerta ? { color: 'var(--estado-f)' } : undefined}>
        {valor}{sufijo}
      </div>
      <div className="etiqueta">{etiqueta}</div>
    </div>
  );
}
```

`src/components/charts/BarrasPorCurso.tsx` — barras apiladas horizontales. Horizontales y no verticales porque el nombre del curso se lee sin rotar texto y en un telefono caben mas filas que columnas.

```tsx
import { useState } from 'react';
import { ESTADOS } from '../../api/contract';
import type { GradeBreakdown } from '../../api/contract';
import { segmentosApilados } from './geometria';

const ALTO_FILA = 34;
const ALTO_BARRA = 18;
const ANCHO_ETIQUETA = 52;
const GAP = 2;              // separacion entre segmentos: sin ella se leen como un bloque

export default function BarrasPorCurso({ datos }: { datos: GradeBreakdown[] }) {
  const [tabla, setTabla] = useState(false);
  const alto = Math.max(ALTO_FILA, datos.length * ALTO_FILA);
  const anchoUtil = 1000 - ANCHO_ETIQUETA;   // viewBox fijo; el SVG escala solo

  return (
    <figure className="grafica">
      <h3>Asistencia por curso</h3>
      <figcaption>Distribucion de registros en el periodo seleccionado</figcaption>

      {tabla ? (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>Curso</th>{ESTADOS.map((e) => <th key={e.valor} className="num">{e.etiqueta}</th>)}</tr>
            </thead>
            <tbody>
              {datos.map((d) => (
                <tr key={d.grade}>
                  <td>{d.grade}</td>
                  <td className="num">{d.present}</td><td className="num">{d.late}</td>
                  <td className="num">{d.absent}</td><td className="num">{d.evasion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg viewBox={`0 0 1000 ${alto}`} width="100%" height={alto} role="img"
             aria-label="Barras apiladas de asistencia por curso">
          {datos.map((d, fila) => {
            const y = fila * ALTO_FILA;
            const segs = segmentosApilados(d, anchoUtil);
            const total = d.present + d.late + d.absent + d.evasion;
            return (
              <g key={d.grade}>
                <text x={0} y={y + ALTO_BARRA - 3} fontSize={13} fill="var(--tinta-suave)">
                  {d.grade}
                </text>
                {segs.length === 0 && (
                  <text x={ANCHO_ETIQUETA} y={y + ALTO_BARRA - 3} fontSize={12} fill="var(--tinta-mute)">
                    sin registros
                  </text>
                )}
                {segs.map((s) => {
                  const color = ESTADOS.find((e) => e.valor === s.estado)!;
                  const ancho = Math.max(0, s.ancho - GAP);
                  const porcentaje = Math.round((s.valor / total) * 100);
                  return (
                    <g key={s.estado}>
                      <rect x={ANCHO_ETIQUETA + s.x} y={y} width={ancho} height={ALTO_BARRA}
                            rx={3} fill={color.color}>
                        <title>{`${d.grade} — ${color.etiqueta}: ${s.valor} (${porcentaje} %)`}</title>
                      </rect>
                      {ancho > 34 && (
                        <text x={ANCHO_ETIQUETA + s.x + ancho / 2} y={y + ALTO_BARRA - 5}
                              fontSize={11} textAnchor="middle"
                              fill={s.estado === 'T' || s.estado === 'E' ? '#0b0b0b' : '#ffffff'}
                              style={{ pointerEvents: 'none' }}>
                          {s.estado}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}

      <div className="leyenda">
        {ESTADOS.map((e) => (
          <span key={e.valor}><i style={{ background: e.color }} />{e.valor} · {e.etiqueta}</span>
        ))}
        <button type="button" className="secundario" style={{ minHeight: 32, padding: '4px 10px' }}
                onClick={() => setTabla(!tabla)}>
          {tabla ? 'Ver grafica' : 'Ver tabla'}
        </button>
      </div>
    </figure>
  );
}
```

La letra del estado va **dentro** de cada segmento cuando cabe: es lo que permite leer la barra sin depender del color, justo lo que necesita quien no distingue amarillo de naranja. Sobre amarillo y naranja la letra va en tinta oscura, no blanca: en claro sobre claro no se leeria.

- [ ] **Step 6: Escribir `LineaTendencia.tsx`**

Una sola serie, con cruceta y lectura del valor. Una serie sola no lleva caja de leyenda: el titulo ya dice que es.

```tsx
import { useState } from 'react';
import { dominioY, puntosLinea } from './geometria';

const ANCHO = 1000;
const ALTO = 220;
const PAD = { arriba: 12, derecha: 12, abajo: 26, izquierda: 46 };

type Props = { serie: { classDate: string; attendanceRate: number }[] };

const fecha = (iso: string) =>
  new Date(`${iso}T00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

export default function LineaTendencia({ serie }: Props) {
  const [activo, setActivo] = useState<number | null>(null);

  const anchoUtil = ANCHO - PAD.izquierda - PAD.derecha;
  const altoUtil = ALTO - PAD.arriba - PAD.abajo;
  const puntos = puntosLinea(serie, anchoUtil, altoUtil);
  const { min, max } = dominioY(serie);

  if (puntos.length === 0) {
    return (
      <figure className="grafica">
        <h3>Tendencia diaria de asistencia</h3>
        <p className="meta">Sin registros en el periodo seleccionado.</p>
      </figure>
    );
  }

  const trazo = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <figure className="grafica">
      <h3>Tendencia diaria de asistencia</h3>
      <figcaption>Porcentaje de presentes y llegadas tarde sobre el total de registros del dia</figcaption>

      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" height={ALTO} role="img"
           aria-label={`Tendencia de asistencia entre ${min} y ${max} por ciento`}
           onMouseLeave={() => setActivo(null)}>
        <g transform={`translate(${PAD.izquierda}, ${PAD.arriba})`}>
          {[0, altoUtil].map((y, i) => (
            <g key={y}>
              <line x1={0} y1={y} x2={anchoUtil} y2={y} stroke="var(--rejilla)" strokeWidth={1} />
              <text x={-8} y={y + 4} fontSize={11} textAnchor="end" fill="var(--tinta-mute)">
                {(i === 0 ? max : min).toFixed(1)}%
              </text>
            </g>
          ))}

          <path d={trazo} fill="none" stroke="var(--azul)" strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" />

          {activo !== null && (
            <line x1={puntos[activo].x} y1={0} x2={puntos[activo].x} y2={altoUtil}
                  stroke="var(--eje)" strokeWidth={1} strokeDasharray="3 3" />
          )}

          {puntos.map((p, i) => (
            <g key={p.fecha}>
              <rect x={p.x - 10} y={0} width={20} height={altoUtil} fill="transparent"
                    tabIndex={0} role="button"
                    aria-label={`${fecha(p.fecha)}: ${p.valor} por ciento`}
                    onMouseEnter={() => setActivo(i)} onFocus={() => setActivo(i)} />
              <circle cx={p.x} cy={p.y} r={activo === i ? 6 : 4}
                      fill="var(--azul)" stroke="var(--superficie)" strokeWidth={2} />
            </g>
          ))}

          <text x={0} y={altoUtil + 18} fontSize={11} fill="var(--tinta-mute)">
            {fecha(puntos[0].fecha)}
          </text>
          {puntos.length > 1 && (
            <text x={anchoUtil} y={altoUtil + 18} fontSize={11} textAnchor="end"
                  fill="var(--tinta-mute)">
              {fecha(puntos[puntos.length - 1].fecha)}
            </text>
          )}
        </g>
      </svg>

      <p className="meta" role="status" style={{ minHeight: '1.4em' }}>
        {activo !== null
          ? `${fecha(puntos[activo].fecha)}: ${puntos[activo].valor} % de asistencia`
          : 'Pase el cursor o toque la linea para ver cada dia.'}
      </p>
    </figure>
  );
}
```

Dos detalles que parecen menores y no lo son: la zona sensible de 20 px por punto (el dedo no acierta un circulo de 8 px en un telefono), y que **el eje Y no arranca en cero**. La asistencia real vive entre 85 % y 100 %; un eje desde cero volveria la linea una raya plana inutil. La compensacion obligatoria es que el maximo y el minimo del periodo salen siempre etiquetados, para que nadie lea una pendiente pronunciada como un derrumbe.

- [ ] **Step 7: Escribir `src/pages/Dashboard.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Dashboard as DashboardData } from '../api/contract';
import Kpi from '../components/charts/Kpi';
import BarrasPorCurso from '../components/charts/BarrasPorCurso';
import LineaTendencia from '../components/charts/LineaTendencia';

const hoyISO = () => new Date().toLocaleDateString('en-CA');
const haceDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
};

const RANGOS = [
  { etiqueta: 'Ultimos 7 dias', dias: 7 },
  { etiqueta: 'Ultimos 30 dias', dias: 30 },
  { etiqueta: 'Ultimos 90 dias', dias: 90 },
];

export default function Dashboard() {
  const [dias, setDias] = useState(30);
  const [grade, setGrade] = useState('');
  const [datos, setDatos] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    setError('');
    const query = `from=${haceDias(dias)}&to=${hoyISO()}`
                + (grade ? `&grade=${encodeURIComponent(grade)}` : '');
    api.get<DashboardData>(`/api/reports/dashboard?${query}`)
       .then(setDatos)
       .catch(() => setError('No se pudo cargar el tablero. Requiere conexion.'))
       .finally(() => setCargando(false));
  }, [dias, grade]);

  return (
    <main className="card">
      <h1>Tablero de asistencia</h1>

      {/* Los filtros van en una sola fila arriba, antes de las graficas */}
      <div className="leyenda" style={{ marginBottom: 16 }}>
        {RANGOS.map((r) => (
          <button key={r.dias} type="button"
                  className={dias === r.dias ? undefined : 'secundario'}
                  style={{ minHeight: 36, padding: '6px 12px' }}
                  aria-pressed={dias === r.dias}
                  onClick={() => setDias(r.dias)}>
            {r.etiqueta}
          </button>
        ))}
        <input aria-label="Filtrar por curso" placeholder="Curso (vacio = todos)"
               value={grade} onChange={(e) => setGrade(e.target.value)}
               style={{ minHeight: 36, padding: '6px 12px' }} />
      </div>

      {error && <p role="alert" className="error">{error}</p>}
      {cargando && <p className="meta">Cargando...</p>}

      {datos && (
        <>
          <div className="kpis">
            <Kpi valor={datos.kpi.attendanceRate.toFixed(1)} sufijo="%"
                 etiqueta="Asistencia del periodo" />
            <Kpi valor={datos.kpi.absentToday} etiqueta="Ausentes hoy"
                 alerta={datos.kpi.absentToday > 0} />
            <Kpi valor={datos.kpi.evasionsWeek} etiqueta="Evasiones esta semana"
                 alerta={datos.kpi.evasionsWeek > 0} />
            <Kpi valor={datos.kpi.blocksPending} etiqueta="Bloques sin marcar hoy"
                 alerta={datos.kpi.blocksPending > 0} />
            <Kpi valor={datos.kpi.schoolDays} etiqueta="Dias lectivos del periodo" />
          </div>

          <LineaTendencia serie={datos.trend} />
          <BarrasPorCurso datos={datos.byGrade} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 8: Mirarlo con los ojos**

Run: `cd frontend && VITE_MOCK=1 npm run dev`, abrir `/dashboard`.
Los tests comprueban la geometria, no la maquetacion. Revisar a mano:
1. Las etiquetas de curso no se montan con las barras.
2. Las letras P/T/F/E dentro de los segmentos se leen; los segmentos estrechos no las muestran, que es lo correcto.
3. La linea no se sale del lienzo y las fechas de los extremos no se cortan.
4. En un telefono estrecho (DevTools, 360 px) nada desborda en horizontal.
5. Con datos escasos salen los mensajes de "sin registros", no un SVG roto.

- [ ] **Step 9: Anotar y commitear**

```bash
echo '- [C2] hecho — dashboard con KPIs, barras por curso y tendencia diaria en SVG' >> docs/ESTADO.md
git add frontend docs && git commit -m "feat: tablero de asistencia con graficas SVG sin dependencias"
```

---

### Task C3: Notificaciones de evasion e inasistencia

**Files:**
- Create: `backend/src/main/resources/db/migration/V20__notificaciones.sql`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/notify/` (Notification, NotificationRepository, NotificationService, NotificationJob)
- Test: `backend/src/test/java/co/edu/ggm/asistencia/notify/NotificationTest.java`
- Modify: `backend/src/main/resources/application.yml` (bloque de correo)

**Interfaces:**
- Consumes: `attendance` y `guardianships`.
- Produces: cola `notifications` y envio periodico cada 15 minutos.

- [ ] **Step 1: Ejecutar la Task 12 de v1 completa, Steps 2 a 11**

Saltar el Step 1 (`spring-boot-starter-mail` ya entro en la Task 0.1). **Renombrar la migracion a `V20__notificaciones.sql`**: es el rango reservado del Track C y es lo que evita que choque con las de Track A al fusionar.

- [ ] **Step 2: Verificar que el calendario ya resuelve el falso positivo**

No hace falta filtrar por dia lectivo en las consultas de notificacion: la Task A4 impide que exista una asistencia en un dia no lectivo, asi que una falta en festivo no puede llegar a la tabla. Anadir este test a `NotificationTest` para dejarlo blindado por si alguien afloja esa regla mas adelante:

```java
    @Test
    void no_existen_faltas_en_dias_no_lectivos_que_puedan_generar_avisos() {
        Integer sospechosas = jdbc.queryForObject("""
                SELECT count(*) FROM attendance a
                LEFT JOIN school_calendar c ON c.calendar_date = a.class_date
                WHERE c.day_type IS DISTINCT FROM 'LECTIVO'
                """, Integer.class);
        assertThat(sospechosas).isZero();
    }
```

- [ ] **Step 3: Ejecutar los tests**

Run: `cd backend && ./mvnw test -Dtest=NotificationTest`
Expected: PASS los cinco.

- [ ] **Step 4: Anotar y commitear**

```bash
echo '- [C3] hecho — cola de notificaciones (V20) con envio cada 15 minutos' >> docs/ESTADO.md
git add backend docs && git commit -m "feat: notificaciones de evasion e inasistencia con cola idempotente"
```

---

### Task C4: Consultas, portal del acudiente e importacion de datos

**Files:**
- Create: `frontend/src/pages/Consultas.tsx`, `frontend/src/pages/Padre.tsx` (reemplazan marcadores)
- Create: `backend/src/main/java/co/edu/ggm/asistencia/student/GuardianController.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/admin/ImportController.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/student/GuardianTest.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/admin/ImportTest.java`

**Interfaces:**
- Produces: `/api/guardian/children`, `/api/admin/import/students`, y las rutas `/consultas` y el portal del padre.

- [ ] **Step 1: Ejecutar la Task 11 de v1, Steps 8 y 10** (`Consultas.tsx` y el aviso de bloques pendientes)

Saltar el Step 9 (la ruta ya esta en `App.tsx` congelado). Anadir la columna "Dias lectivos" a la tabla de `Consultas.tsx`, que ya viene en `summary` desde la Task C1:

```tsx
<tr><th>Estudiante</th><th>Curso</th><th className="num">Lectivos</th>
    <th className="num">P</th><th className="num">T</th>
    <th className="num">F</th><th className="num">E</th></tr>
```
y en el cuerpo, `<td className="num">{f.schoolDays}</td>` justo despues del curso.

- [ ] **Step 2: Ejecutar la Task 13 de v1 completa, Steps 1 a 6** (portal del acudiente)

Saltar el Step 7 (el enrutado por rol ya esta en el `App.tsx` congelado).

- [ ] **Step 3: Ejecutar la Task 14 de v1, Steps 1 a 6** (importacion de estudiantes por CSV)

El resto de la Task 14 de v1 (Docker, CI, despliegue) es de la Fase Z.

- [ ] **Step 4: Ejecutar toda la suite del track**

Run: `cd backend && ./mvnw test` y `cd frontend && npm test`
Expected: PASS todo.

- [ ] **Step 5: Anotar, commitear y publicar el track**

```bash
echo '- [C4] hecho — consultas, portal del acudiente e importacion CSV; TRACK C COMPLETO' >> docs/ESTADO.md
git add backend frontend docs
git commit -m "feat: consultas con dias lectivos, portal del acudiente e importacion CSV"
# push deshabilitado: el remoto es ajeno. Solo commits locales.
```

---

# FASE Z — Integracion y despliegue (secuencial, una terminal)

### Task Z1: Fusionar los tres tracks, empaquetar y desplegar

**Files:**
- Create: `Dockerfile`, `.github/workflows/ci.yml`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/config/SpaConfig.java`

- [ ] **Step 1: Fusionar en orden**

A primero porque B y C dependen de sus endpoints; C antes que B porque C toca mas backend y B casi solo frontend, asi los conflictos aparecen antes y en menos ficheros.

```bash
git checkout main
git merge --no-ff track-a-nucleo   && cd backend && ./mvnw test && cd ..
git merge --no-ff track-c-analitica && cd backend && ./mvnw test && cd ..
git merge --no-ff track-b-app       && cd frontend && npm test && npm run build && cd ..
```

Si aparece un conflicto que no sea en `docs/ESTADO.md`, **es un fallo de la disciplina de propiedad de ficheros**, no un accidente: anotar cual fue en `ESTADO.md` para no repetirlo.

- [ ] **Step 2: Apagar el modo mock y probar de verdad**

```bash
docker compose up -d db
cd backend && ./mvnw spring-boot:run
cd frontend && npm run dev      # SIN VITE_MOCK
```
Recorrido completo: login real, bootstrap real, marcar asistencia, modo avion, volver, verificar en la base que no hay duplicados, abrir el dashboard con datos reales.

- [ ] **Step 3: Ejecutar la Task 14 de v1, Steps 7, 8, 9 y 10**

`Dockerfile` de tres etapas, `SpaConfig` para el fallback de rutas de la SPA, workflow de CI y despliegue con las variables de entorno.

- [ ] **Step 4: Verificacion final de extremo a extremo**

Run: `cd backend && ./mvnw verify` y `cd frontend && npm test && npm run build`
Expected: PASS todo. Luego, contra el despliegue real y desde un telefono:
1. Instalar la PWA.
2. Modo avion: abrir la app y tomar la asistencia de un curso completo.
3. Quitar el modo avion: los registros llegan sin duplicados.
4. Intentar marcar en un festivo: la app lo impide y el servidor tambien.
5. Escanear un carnet real y comprobar que el numero coincide con `document_id`.
6. Descargar el Excel desde coordinacion y abrir el dashboard.

- [ ] **Step 5: Limpiar los worktrees**

```bash
git worktree remove .worktrees/track-a
git worktree remove .worktrees/track-b
git worktree remove .worktrees/track-c
```

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .github backend docs
git commit -m "feat: integracion de los tres tracks, imagen Docker y CI"
```

---

## Reparto sugerido y ruta critica

| Terminal | Rama | Tareas | Puede empezar |
|---|---|---|---|
| 1 | `track-a-nucleo` | A1, A2, A3, A4 | Inmediatamente tras la Fase 0 |
| 2 | `track-b-app` | B1, B2, B3, B4 | Inmediatamente tras la Fase 0 |
| 3 | `track-c-analitica` | **C2**, C1, C3, C4 | Inmediatamente tras la Fase 0 |

**Ruta critica: A1 -> C1.** Es la unica dependencia dura entre tracks (`JwtService`). Por eso la terminal 3 arranca por C2, que es puro frontend contra el fixture, y entra a C1 cuando A1 este en `main` — cuestion de horas, no de dias.

Las tres terminales pueden trabajar el mismo dia porque:
- El esquema completo, incluido el calendario, ya existe desde la Fase 0.
- El contrato y los fixtures estan congelados.
- `App.tsx`, `styles.css`, `pom.xml` y `package.json` estan congelados con todo dentro.
- Los rangos de version de Flyway estan repartidos.

## Fuera de alcance (planes de seguimiento)

1. **Pantalla de administracion de usuarios, horarios y acudientes.** Hoy entran por SQL o por la importacion CSV de estudiantes. Es un subsistema completo (altas, bajas, reseteo de contrasenas, carga del horario) y merece su plan.
2. **Dias institucionales A/B en vez de dias de la semana.** Miguel Bacca pidio no manejar lunes-viernes sino dias institucionales, y separar los laboratorios. `school_calendar` ya deja el hueco natural (bastaria una columna `institutional_day`), pero cambiar `schedule_blocks.weekday` por un ciclo A/B es rediseno del modelo de horario. El calendario mas el selector de fecha ya cubren el motivo original de la peticion: registrar el dia correcto y saltarse los no lectivos.
3. **Calendario de anos siguientes.** `V2` siembra 2026. Cada ano hay que sembrar el siguiente; con la pantalla del punto 1 seria una carga y no una migracion.
4. **Foto del estudiante en la ficha.** Necesita almacenamiento de objetos y politica de datos de menores.
5. **Notificacion de llegada tarde.** El `kind` `LLEGADA_TARDE` existe en el CHECK pero no se encola: falta que el colegio defina desde que hora una tardanza se reporta. Es decision de la institucion.
6. **Dashboard por docente y comparativa entre periodos.** El tablero actual es del colegio. Un tablero personal por docente es otra consulta y otra pantalla.
7. **Notificaciones push.** El correo cubre el requisito; Web Push exige VAPID y un service worker que reciba en segundo plano.

## Riesgos conocidos

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| Las fechas de recesos sembradas no son las del colegio | Dias lectivos mal contados, asistencia bloqueada sin razon | El test "dias lectivos razonable" (Task 0.2) atrapa los errores gruesos; la rectoria confirma antes de produccion y el `PUT` corrige sin tocar SQL |
| Un track edita un fichero ajeno | Conflictos al fusionar | Tabla de propiedad + congelacion en Fase 0; cualquier conflicto fuera de `ESTADO.md` se anota como fallo de proceso |
| El contrato cambia a mitad de camino | B y C construyen contra algo que ya no existe | Test de contrato en A3 contra el mismo fixture; todo cambio pasa por `ESTADO.md` |
| Los codigos de los carnets no coinciden con los documentos | El escaneo no reconoce a nadie | Se verifica con carnets reales en B4 antes de depender de ello |
| El colegio no tiene HTTPS | Ni camara ni PWA instalable | Requisito explicito del despliegue (Task Z1) |
| Alguien "arregla" el orden de los colores | La grafica deja de ser legible con daltonismo | Documentado en `contract.ts`, en la Task C2 y en las constraints globales, con el numero que lo justifica |

## Self-review

Cobertura de lo pedido en esta iteracion:

- **Carnet = tarjeta de identidad** -> constraint global, Task 0.2 (`students.document_id` como clave natural) y Task B4. Ya era el diseno de v1; aqui queda escrito de forma explicita.
- **Calendario con festivos y vacaciones** -> tabla `school_calendar` (Task 0.2), API y cache (Task A2), validacion en el servidor (Task A4), bloqueo en la interfaz (Tasks B2 y B3), denominador correcto en reportes y dashboard (Tasks C1 y C2).
- **Dashboard** -> endpoint (Task C1), KPIs y dos graficas en SVG sin dependencias (Task C2).
- **Trabajo en paralelo con tres terminales** -> Fase 0 con contratos congelados, tabla de propiedad de ficheros, worktrees, rangos de Flyway y `docs/ESTADO.md`.
- **La herramienta para comunicar terminales** -> respondida en "El mecanismo real": no existe mensajeria entre sesiones; se usan worktrees mas un fichero de estado, y los subagentes con `SendMessage` quedan para paralelizar **dentro** de una terminal.

Cobertura del material original, heredada de v1 y revisada: migracion a base SQL, validacion de duplicados, codigos del carnet, notificaciones de evasion e inasistencia, datos personales del estudiante, pantalla de confirmacion, pantalla de consulta, offline, nombres en el registro, horario por profesor, fechas especificas, comentarios y reemplazos.

Consistencia verificada de punta a punta: `document_id`/`documentId`, `schedule_block_id`/`scheduleBlockId`, `class_date`/`classDate`, `calendar_date`/`calendarDate`, `day_type`/`dayType`, `school_days`/`schoolDays`. Los estados son `P`/`T`/`F`/`E` en SQL, Java y TypeScript, y su orden de apilado es el mismo en `contract.ts`, en la grafica y en la tabla.

Decisiones de color, para que no se re-discutan sin datos: los cuatro estados usan la paleta de estado (`P` `#0ca30c`, `T` `#fab219`, `F` `#d03b3b`, `E` `#ec835a`) en ese orden, que es el que pasa las comprobaciones de separacion para daltonismo (peor par contiguo ΔE 11,3) y para vision normal (peor par contiguo ΔE 15,7) en modo claro y oscuro. El orden P, T, E, F falla: pone `#fab219` junto a `#ec835a`, ΔE 13,6 sobre un minimo de 15. Amarillo y naranja quedan por debajo de 3:1 de contraste contra el fondo claro, y por eso la letra del estado dentro del segmento y la vista de tabla son obligatorias, no opcionales.
