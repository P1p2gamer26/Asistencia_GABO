# Calendario, Horario y Vistas de Administración — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el colegio pueda ver su calendario escolar y su horario semanal en pantalla, que el docente sepa en qué aula le toca y entre a tomar la lista desde ahí, y que el administrador aterrice en un tablero del día en vez de un menú de botones.

**Architecture:** Se añade la única pieza de datos que falta —el aula de cada bloque— y sobre el modelo que ya existe (`school_calendar` y `schedule_blocks`) se construyen dos vistas nuevas: un calendario mensual que dice qué días hay clase, y una rejilla de horario semanal desde la cual se entra a tomar asistencia. La navegación pasa de botones sueltos a una barra lateral persistente, y el inicio del administrador se convierte en un tablero centrado en hoy.

**Tech Stack:** Java 21, Spring Boot 3.4, PostgreSQL 16, Flyway, React 18, TypeScript, Vite, Vitest.

**Spec:** Este documento. Contexto y decisiones previas en `docs/INFORME-FINAL.md`.

## Qué existe ya, y qué falta de verdad

Antes de proponer nada conviene separar lo que hay de lo que hace falta, porque buena
parte del modelo ya está construido y sería un error rehacerlo:

| Pieza | Estado |
|---|---|
| Tabla `school_calendar` con festivos, vacaciones y días suspendidos | **Existe** y está sembrada con 2026 |
| API del calendario (`GET`/`PUT /api/calendar/school-days`) | **Existe** |
| Tabla `schedule_blocks` (grado, día, bloque, horas, materia, docente) | **Existe** |
| **Aula donde se dicta cada bloque** | **No existe**: es la columna que falta para decir *dónde* |
| **Vista de calendario** (una cuadrícula de mes, no una tabla de filas) | **No existe** |
| **Vista de horario semanal** para el docente | **No existe** |
| **Barra lateral** de navegación | **No existe**: hoy son enlaces sueltos en el inicio |
| **Tablero del día** para el administrador | **No existe**: el tablero actual es del mes |
| Datos en la base local para poder ver todo esto | **3 estudiantes, 1 bloque**: no se puede ver nada |

Lo último no es un detalle. **Con tres estudiantes y un bloque, ninguna de las vistas
nuevas se puede evaluar**, y el proyecto ya demostró varias veces que los defectos
aparecen con volumen realista y no con datos de juguete.

## Global Constraints

- **El proyecto vive en `app/`**: `app/backend`, `app/frontend`, `app/contracts`.
- **MVC clásico por capas** en el backend (`app/README.md`): el sufijo de la clase decide su paquete — `*Controller` a `controller/`, `*Service` y `*Job` a `service/`, `*Repository` a `repository/`, `*Config` y `*Filter` a `config/`, el resto a `model/`. **No crear paquetes por funcionalidad.**
- **PostgreSQL 16 local.** Backend: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
- **Rango de versiones Flyway reservado: `V50`-`V59`.**
- **Ningún test puede mutar los datos de la semilla.** El contexto de Spring se comparte entre clases y la CI corre con `-Dsurefire.runOrder=random` para atrapar dependencias de orden. **Ningún test puede depender de qué día es hoy**: usar fechas fijas y probar el repositorio cuando el endpoint use "hoy".
- **`waitFor`, nunca `findByRole`,** para contenido que depende de un efecto asíncrono.
- **Sin dependencias nuevas.** Nada de librerías de calendario ni de rejillas: son cuadrículas CSS.
- **El paquete de producción debe seguir por debajo de 200 KB gzip** (hoy 100 KB).
- **Estados y colores fijos:** `P` `#0ca30c`, `T` `#fab219`, `F` `#d03b3b`, `E` `#ec835a`, en ese orden de apilado, que es el único que pasa las comprobaciones de daltonismo.
- **`tools/humo.sh` debe seguir pasando.**
- **Idioma:** identificadores en inglés, texto visible en español. Sin tildes ni letra eñe en nombres de ficheros, tablas, columnas ni campos JSON.
- **Commits:** Conventional Commits en español, terminando con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
app/backend/src/main/
├── resources/db/migration/V50__aula.sql              (nuevo)
└── java/co/edu/ggm/asistencia/
    ├── model/ScheduleBlock.java                      (modificar) campo room
    ├── repository/ScheduleRepository.java            (modificar) horario por grado
    ├── repository/ReportRepository.java              (modificar) resumen de hoy
    ├── service/ImportService.java                    (modificar) columna aula en el CSV
    ├── service/TodayService.java                     (nuevo)     el tablero de hoy
    ├── controller/BootstrapController.java           (modificar) room en los bloques
    ├── controller/ScheduleController.java            (nuevo)     horario semanal
    └── controller/ReportController.java              (modificar) endpoint de hoy

app/frontend/src/
├── api/contract.ts                                   (modificar) tipos nuevos
├── components/Menu.tsx                               (nuevo)     barra lateral
├── components/Layout.tsx                             (nuevo)     armazon con la barra
├── pages/Calendario.tsx                              (nuevo)     cuadricula del mes
├── pages/Horario.tsx                                 (nuevo)     rejilla semanal
├── pages/InicioAdmin.tsx                             (nuevo)     tablero de hoy
├── pages/Home.tsx                                    (modificar) reparte segun rol
├── App.tsx                                           (modificar) rutas nuevas
└── styles.css                                        (modificar) barra, cuadricula, rejilla

tools/
└── datos-locales.sql                                 (nuevo)     poblar la base de desarrollo
```

## Orden y dependencias

```
Task 1  Aula (backend)          -> la necesita el horario
Task 2  API de horario semanal  -> la necesitan el horario y el portal del acudiente
Task 3  Vista de calendario     -> independiente
Task 4  Vista de horario        -> depende de 1 y 2
Task 5  Barra lateral y armazon -> independiente, pero conviene tras 3 y 4 para enlazarlas
Task 6  Inicio del administrador-> depende de 5 para tener donde vivir
Task 7  Inicio del docente      -> depende de 1 (aula) y de 5
Task 8  Portal del acudiente    -> depende de 1 y 2
Task 9  Datos locales           -> al final, cuando ya hay que llenar
```

Las tres pantallas de inicio (6, 7 y 8) son independientes entre si y tocan ramas
distintas de `Inicio` en `App.tsx`: **cada una cambia solo su rol**, para que no se pisen.

**La siembra va la ultima a peticion del colegio.** Hasta entonces las vistas se
comprueban con los tests, que traen sus propios datos. Al llegar a la Task 9 se siembra
una sola vez, con el esquema ya cerrado, y se recorren las pantallas con datos de verdad.

### Cada quien aterriza donde le sirve

Al entrar, la ruta `/` reparte por rol, y **todo lo demas vive en la barra lateral**
(Task 5), no en botones sueltos:

| Rol | Aterriza en | Y ve de un vistazo |
|---|---|---|
| Administrador / coordinacion | Task 6 | cuantos bloques han reportado, presentes, ausentes, tarde, evasiones e ingresos de hoy, con el mes de contexto |
| Docente | Task 7 | en que aula tiene cada clase hoy y de que cursos ya paso lista |
| Acudiente | Task 8 | cuantos dias asistio y falto cada hijo, sus novedades y su horario |

Un acudiente puede tener **uno o varios hijos**, y eso ya funciona: `guardianships` es
tabla de union con clave `(student_id, guardian_id)`, con indice por `guardian_id` desde
`V30`, el endpoint devuelve una lista y `Padre.tsx` ya la recorre. La Task 8 no construye
esa relacion; anade datos a cada hijo **y le pone por fin un test**, porque hoy no hay
ninguno con un acudiente de dos hijos.

---

## Task 1: El aula donde se dicta cada bloque

**Files:**
- Create: `app/backend/src/main/resources/db/migration/V50__aula.sql`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/model/ScheduleBlock.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/BootstrapController.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/service/ImportService.java`
- Modify: `app/frontend/src/api/contract.ts`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/sync/BootstrapTest.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/admin/ImportHorarioTest.java`

**Interfaces:**
- Consumes: tabla `schedule_blocks`.
- Produces:
  - Columna `schedule_blocks.room VARCHAR(60)`, opcional.
  - `GET /api/sync/bootstrap` devuelve `room` en cada bloque.
  - El CSV de horario acepta una octava columna: `grade,weekday,block_no,start_time,end_time,subject,teacher_email,room`.

**El aula es opcional a propósito.** Un colegio puede no tener asignación fija de aulas,
o tenerla solo para algunos bloques, y obligar a rellenarla bloquearía la carga del
horario. Cuando falta, la interfaz simplemente no muestra el dato.

Se hace **una columna de texto libre y no una tabla de aulas**: el colegio tiene unas
pocas decenas y lo único que se necesita es mostrar el nombre. Una tabla con su
mantenimiento sería infraestructura para un dato que nadie va a consultar por separado.

- [ ] **Step 1: Escribir la migración `V50__aula.sql`**

```sql
ALTER TABLE schedule_blocks ADD COLUMN room VARCHAR(60);

COMMENT ON COLUMN schedule_blocks.room IS
  'Aula donde se dicta el bloque. Opcional: no todos los colegios asignan aula fija.';
```

- [ ] **Step 2: Escribir el test que falla**

Añadir a `BootstrapTest`:

```java
    @Test
    void el_bloque_dice_en_que_aula_es() throws Exception {
        jdbcBase.update("UPDATE schedule_blocks SET room = 'Aula 201' WHERE id = 1");
        mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.blocks[0].room").value("Aula 201"));
    }

    @Test
    void un_bloque_sin_aula_no_rompe_nada() throws Exception {
        jdbcBase.update("UPDATE schedule_blocks SET room = NULL WHERE id = 1");
        mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.blocks[0].grade").value("601"));
    }
```

Y a `ImportHorarioTest`:

```java
    @Test
    void el_csv_de_horario_acepta_el_aula() throws Exception {
        String contenido = """
                grade,weekday,block_no,start_time,end_time,subject,teacher_email,room
                704,3,2,07:20,08:10,Sociales,aula.import@ggm.edu.co,Laboratorio 2
                """;
        mvc.perform(multipart("/api/admin/import/schedule").file(csv(contenido))
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(1));

        assertThat(jdbcBase.queryForObject(
                "SELECT room FROM schedule_blocks WHERE grade='704' AND block_no=2",
                String.class)).isEqualTo("Laboratorio 2");
    }

    @Test
    void un_csv_de_horario_sin_columna_de_aula_sigue_funcionando() throws Exception {
        // Los archivos que el colegio ya haya preparado no deben dejar de servir.
        String contenido = """
                grade,weekday,block_no,start_time,end_time,subject,teacher_email
                705,3,2,07:20,08:10,Sociales,aula.import@ggm.edu.co
                """;
        mvc.perform(multipart("/api/admin/import/schedule").file(csv(contenido))
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(1));

        assertThat(jdbcBase.queryForObject(
                "SELECT room FROM schedule_blocks WHERE grade='705' AND block_no=2",
                String.class)).isNull();
    }
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest='BootstrapTest,ImportHorarioTest'`
Expected: FAIL — no existe `room` ni en la respuesta ni en la tabla.

- [ ] **Step 4: Añadir el campo a `ScheduleBlock`**

```java
    private String room;
```

- [ ] **Step 5: Devolverlo en `BootstrapController`**

Ampliar el record y el mapeo:

```java
    public record BlockDto(Long id, String grade, int weekday, int blockNo,
                           String subject, String startTime, String room) {}
```

```java
    private static BlockDto toDto(ScheduleBlock b) {
        LocalTime start = b.getStartTime();
        return new BlockDto(b.getId(), b.getGrade(), b.getWeekday(), b.getBlockNo(),
                b.getSubject().getName(),
                String.format("%02d:%02d", start.getHour(), start.getMinute()),
                b.getRoom());
    }
```

- [ ] **Step 6: Aceptar la columna en `ImportService`**

En `importarHorario`, bajar el mínimo de columnas de 7 a 7 (no cambia) y leer la octava
si viene:

```java
        return recorrer(entrada, 7, (c, n) -> {
            ...
            Long docenteId = idDeDocente(c[6].trim().toLowerCase());
            // El aula es opcional: los archivos que el colegio ya tenga preparados
            // vienen con siete columnas y deben seguir sirviendo.
            String aula = c.length > 7 && !c[7].isBlank() ? c[7].trim() : null;

            jdbc.update("""
                    INSERT INTO schedule_blocks
                      (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id, room)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (grade, weekday, block_no) DO UPDATE
                      SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
                          subject_id = EXCLUDED.subject_id, teacher_id = EXCLUDED.teacher_id,
                          room = EXCLUDED.room
                    """, grade, weekday, blockNo, inicio, fin, materiaId, docenteId, aula);
        });
```

- [ ] **Step 7: Añadir el campo al contrato del frontend**

En `app/frontend/src/api/contract.ts`, en el tipo `Block`:

```ts
  room?: string;
```

- [ ] **Step 8: Actualizar la cabecera documentada del CSV**

En `app/frontend/src/components/admin/PanelCarga.tsx`, la cabecera de "Horario":

```tsx
    cabecera: 'grade,weekday,block_no,start_time,end_time,subject,teacher_email,room' },
```

Y en `app/contracts/api.md`, en la sección de administración.

- [ ] **Step 9: Ejecutar los tests**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test` y `cd app/frontend && npm test`
Expected: PASS todo, en cualquier orden de ejecución.

- [ ] **Step 10: Commit**

```bash
git add app/backend app/frontend app/contracts
git commit -m "feat: el horario dice en que aula se dicta cada bloque

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: API del horario semanal

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/repository/ScheduleRepository.java`
- Create: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/ScheduleController.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/schedule/HorarioTest.java`

**Interfaces:**
- Consumes: `schedule_blocks` con `room` (Task 1), `JwtService.currentUserId()`.
- Produces:
  - `GET /api/schedule/week` (cualquier usuario autenticado) -> el horario de **quien entró**: `[{id, grade, weekday, blockNo, subject, startTime, endTime, room, teacherName}]`
  - `GET /api/schedule/week?grade=601` (COORDINADOR, ADMIN) -> el horario **de un curso**, con el nombre del docente de cada bloque.

Son dos preguntas distintas y por eso el mismo endpoint responde a las dos: *"¿dónde
tengo clase yo?"* la hace el docente desde el celular, y *"¿quién le da ciencias a
601?"* la hace coordinación. Un docente que pida un grado ajeno recibe **403**: su
horario es lo suyo.

`GET /api/schedule/mine`, que ya existe, se mantiene: lo usa el paquete de arranque y
devuelve solo los bloques sin el nombre del docente.

- [ ] **Step 1: Escribir el test**

```java
package co.edu.ggm.asistencia.schedule;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Usa su propio curso (grado 888) y su propio docente para no mutar la semilla.
 */
@AutoConfigureMockMvc
class HorarioTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private Long docenteId;

    @BeforeEach
    void datos() {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('horario@horariotest.co', 'x', 'Pepito Perez', 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """);
        docenteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'horario@horariotest.co'", Long.class);

        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('CienciasHorario') ON CONFLICT (name) DO NOTHING");
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id, room)
                VALUES ('888', 2, 3, '08:15', '09:05',
                        (SELECT id FROM subjects WHERE name = 'CienciasHorario'), ?, 'Laboratorio 1')
                ON CONFLICT (grade, weekday, block_no) DO UPDATE
                  SET teacher_id = EXCLUDED.teacher_id, room = EXCLUDED.room
                """, docenteId);
    }

    @Test
    void el_docente_ve_su_semana_con_curso_materia_y_aula() throws Exception {
        mvc.perform(get("/api/schedule/week")
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='888')].subject").value("CienciasHorario"))
           .andExpect(jsonPath("$[?(@.grade=='888')].room").value("Laboratorio 1"))
           .andExpect(jsonPath("$[?(@.grade=='888')].weekday").value(2))
           .andExpect(jsonPath("$[?(@.grade=='888')].startTime").value("08:15"))
           .andExpect(jsonPath("$[?(@.grade=='888')].endTime").value("09:05"));
    }

    @Test
    void el_docente_solo_ve_sus_bloques() throws Exception {
        // El bloque de la semilla es de otro docente y no debe aparecer.
        mvc.perform(get("/api/schedule/week")
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='601')]").doesNotExist());
    }

    @Test
    void coordinacion_puede_pedir_el_horario_de_un_curso_con_el_nombre_del_docente()
            throws Exception {
        mvc.perform(get("/api/schedule/week").param("grade", "888")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].teacherName").value("Pepito Perez"))
           .andExpect(jsonPath("$[0].room").value("Laboratorio 1"));
    }

    @Test
    void un_docente_no_puede_pedir_el_horario_de_un_curso() throws Exception {
        mvc.perform(get("/api/schedule/week").param("grade", "888")
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE")))
           .andExpect(status().isForbidden());
    }

    @Test
    void sin_token_no_se_ve_ningun_horario() throws Exception {
        mvc.perform(get("/api/schedule/week")).andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest=HorarioTest`
Expected: FAIL con 404 en `/api/schedule/week`.

- [ ] **Step 3: Añadir las consultas a `ScheduleRepository`**

```java
    interface WeekRow {
        Long getId();
        String getGrade();
        int getWeekday();
        int getBlockNo();
        String getSubject();
        java.time.LocalTime getStartTime();
        java.time.LocalTime getEndTime();
        String getRoom();
        String getTeacherName();
    }

    @org.springframework.data.jpa.repository.Query(value = """
            SELECT b.id AS id, b.grade AS grade, b.weekday AS weekday, b.block_no AS blockNo,
                   s.name AS subject, b.start_time AS startTime, b.end_time AS endTime,
                   b.room AS room, u.full_name AS teacherName
            FROM schedule_blocks b
            JOIN subjects s ON s.id = b.subject_id
            JOIN users u ON u.id = b.teacher_id
            WHERE b.teacher_id = :teacherId
            ORDER BY b.weekday, b.block_no
            """, nativeQuery = true)
    java.util.List<WeekRow> weekOfTeacher(
            @org.springframework.data.repository.query.Param("teacherId") Long teacherId);

    @org.springframework.data.jpa.repository.Query(value = """
            SELECT b.id AS id, b.grade AS grade, b.weekday AS weekday, b.block_no AS blockNo,
                   s.name AS subject, b.start_time AS startTime, b.end_time AS endTime,
                   b.room AS room, u.full_name AS teacherName
            FROM schedule_blocks b
            JOIN subjects s ON s.id = b.subject_id
            JOIN users u ON u.id = b.teacher_id
            WHERE b.grade = :grade
            ORDER BY b.weekday, b.block_no
            """, nativeQuery = true)
    java.util.List<WeekRow> weekOfGrade(
            @org.springframework.data.repository.query.Param("grade") String grade);
```

- [ ] **Step 4: Escribir `ScheduleController`**

```java
package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.repository.ScheduleRepository;
import co.edu.ggm.asistencia.service.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalTime;
import java.util.List;

@RestController
@RequestMapping("/api/schedule")
public class ScheduleController {

    private final ScheduleRepository schedules;

    public ScheduleController(ScheduleRepository schedules) { this.schedules = schedules; }

    public record WeekBlock(Long id, String grade, int weekday, int blockNo, String subject,
                            String startTime, String endTime, String room, String teacherName) {}

    @GetMapping("/week")
    public List<WeekBlock> week(@RequestParam(required = false) String grade) {
        List<ScheduleRepository.WeekRow> filas;

        if (grade == null || grade.isBlank()) {
            // "Donde tengo clase yo": la pregunta del docente desde el celular.
            filas = schedules.weekOfTeacher(JwtService.currentUserId());
        } else {
            // "Quien le da ciencias a 601": la pregunta de coordinacion. El horario de
            // un docente es suyo, asi que pedir el de un curso exige otro rol.
            if (!tieneRol("ROLE_COORDINADOR") && !tieneRol("ROLE_ADMIN")) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Solo coordinacion puede consultar el horario de un curso");
            }
            filas = schedules.weekOfGrade(grade.trim());
        }

        return filas.stream().map(ScheduleController::toDto).toList();
    }

    private static boolean tieneRol(String rol) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> rol.equals(a.getAuthority()));
    }

    private static String hhmm(LocalTime t) {
        return t == null ? null : String.format("%02d:%02d", t.getHour(), t.getMinute());
    }

    private static WeekBlock toDto(ScheduleRepository.WeekRow r) {
        return new WeekBlock(r.getId(), r.getGrade(), r.getWeekday(), r.getBlockNo(),
                r.getSubject(), hhmm(r.getStartTime()), hhmm(r.getEndTime()),
                r.getRoom(), r.getTeacherName());
    }
}
```

`ScheduleController` no lleva `@PreAuthorize` de clase porque el permiso depende del
parámetro, no de la ruta: sin `grade` cualquiera puede pedir **el suyo**.

- [ ] **Step 5: Ejecutar los tests**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
Expected: PASS todo. **Si `GET /api/schedule/mine` deja de funcionar**, es que la nueva
clase se comió el mapeo: `mine` vive en `BootstrapController` y ambos cuelgan de
`/api/schedule`. Spring lo permite mientras las rutas completas no choquen; si choca,
mover `mine` a este controlador.

- [ ] **Step 6: Commit**

```bash
git add app/backend
git commit -m "feat: API del horario semanal, propio y por curso

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Calendario escolar en pantalla

**Files:**
- Create: `app/frontend/src/pages/Calendario.tsx`
- Test: `app/frontend/src/pages/Calendario.test.tsx`
- Modify: `app/frontend/src/App.tsx`
- Modify: `app/frontend/src/styles.css`

**Interfaces:**
- Consumes: `GET /api/calendar/school-days?from=&to=` y `PUT /api/calendar/school-days/{date}`, que **ya existen**.
- Produces: ruta `/calendario`, visible para todos los roles autenticados.

Hoy el calendario solo existe como una tabla de filas dentro de administración. Lo que
pide el colegio es **ver el mes**: qué días hay clase y cuáles no. Una cuadrícula
mensual responde esa pregunta de un vistazo; una tabla de 30 filas, no.

**Los colores no son decoración.** Cada tipo de día lleva además su etiqueta escrita,
porque distinguir "festivo" de "vacaciones" solo por el tono es justo el error que este
proyecto ya corrigió en las gráficas.

- [ ] **Step 1: Escribir los tests**

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Calendario from './Calendario';

const DIAS = [
  { calendarDate: '2026-08-03', dayType: 'LECTIVO' },
  { calendarDate: '2026-08-04', dayType: 'LECTIVO' },
  { calendarDate: '2026-08-07', dayType: 'FESTIVO', description: 'Batalla de Boyaca' },
  { calendarDate: '2026-08-17', dayType: 'FESTIVO', description: 'Asuncion' },
  { calendarDate: '2026-08-19', dayType: 'SUSPENDIDO', description: 'Paro de transporte' },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Calendario', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'DOCENTE',
      fullName: 'Docente', userId: 3, mustChangePassword: false,
    }));
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DIAS)));
  });

  it('pinta los dias del mes en una cuadricula', async () => {
    render(<Calendario />);
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());
    expect(within(screen.getByRole('grid')).getByText('3')).toBeInTheDocument();
  });

  it('dice por escrito que es cada dia no lectivo, no solo con color', async () => {
    render(<Calendario />);
    // Distinguir festivo de vacaciones solo por el tono es el error que ya se corrigio
    // en las graficas: cada dia especial lleva su etiqueta.
    await waitFor(() =>
      expect(screen.getByLabelText(/7 de agosto.*festivo/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/19 de agosto.*suspendido/i)).toBeInTheDocument();
  });

  it('muestra el motivo cuando lo hay', async () => {
    render(<Calendario />);
    await waitFor(() =>
      expect(screen.getByText(/Batalla de Boyaca/)).toBeInTheDocument());
  });

  it('cuenta cuantos dias de clase tiene el mes', async () => {
    render(<Calendario />);
    await waitFor(() => expect(screen.getByText(/2 dias de clase/i)).toBeInTheDocument());
  });

  it('un docente no puede cambiar el calendario', async () => {
    render(<Calendario />);
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('coordinacion si puede cambiar el tipo de un dia', async () => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'COORDINADOR',
      fullName: 'Coordinacion', userId: 2, mustChangePassword: false,
    }));
    const puts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { puts.push(String(url)); return respuesta({}); }
      return respuesta(DIAS);
    }));

    render(<Calendario />);
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0));
    await userEvent.selectOptions(
      screen.getByLabelText(/tipo de dia para 2026-08-03/i), 'SUSPENDIDO');

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(String(puts[0])).toContain('/api/calendar/school-days/2026-08-03');
  });

  it('sin conexion lo dice en vez de mostrar un mes vacio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    render(<Calendario />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i));
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd app/frontend && npm test src/pages/Calendario.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir `Calendario.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { api, getSession } from '../api/client';
import type { DayType, SchoolDay } from '../api/contract';

const TIPOS: DayType[] = ['LECTIVO', 'FESTIVO', 'VACACIONES', 'INSTITUCIONAL', 'SUSPENDIDO'];

const ETIQUETA: Record<DayType, string> = {
  LECTIVO: 'clase',
  FESTIVO: 'festivo',
  VACACIONES: 'vacaciones',
  INSTITUCIONAL: 'jornada institucional',
  SUSPENDIDO: 'suspendido',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Lunes a domingo: el colegio piensa la semana empezando en lunes. */
const CABECERAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

const dosDigitos = (n: number) => String(n).padStart(2, '0');
const fechaISO = (a: number, m: number, d: number) =>
  `${a}-${dosDigitos(m + 1)}-${dosDigitos(d)}`;

export default function Calendario() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [dias, setDias] = useState<Record<string, SchoolDay>>({});
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const puedeEditar = ['COORDINADOR', 'ADMIN'].includes(getSession()?.role ?? '');

  const primero = new Date(anio, mes, 1);
  const ultimo = new Date(anio, mes + 1, 0);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const lista = await api.get<SchoolDay[]>(
        `/api/calendar/school-days?from=${fechaISO(anio, mes, 1)}`
        + `&to=${fechaISO(anio, mes, ultimo.getDate())}`);
      setDias(Object.fromEntries(lista.map((d) => [d.calendarDate, d])));
    } catch {
      setError('No se pudo cargar el calendario. Requiere conexion.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { void cargar(); }, [anio, mes]);

  async function cambiar(fecha: string, tipo: DayType) {
    setError('');
    try {
      await api.put(`/api/calendar/school-days/${fecha}`,
        { dayType: tipo, description: dias[fecha]?.description ?? null });
      await cargar();
    } catch {
      setError('No se pudo actualizar ese dia.');
    }
  }

  // Las casillas vacias del principio: getDay() da 0 para domingo y la semana empieza
  // en lunes, asi que el domingo va al final.
  const huecos = (primero.getDay() + 6) % 7;

  const lectivos = useMemo(
    () => Object.values(dias).filter((d) => d.dayType === 'LECTIVO').length,
    [dias]);

  function mover(delta: number) {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
  }

  return (
    <main className="card ancha">
      <h1>Calendario escolar</h1>

      <div className="leyenda" style={{ marginBottom: 12 }}>
        <button type="button" className="secundario" onClick={() => mover(-1)}>Mes anterior</button>
        <strong style={{ minWidth: '10rem', textAlign: 'center' }}>
          {MESES[mes]} de {anio}
        </strong>
        <button type="button" className="secundario" onClick={() => mover(1)}>Mes siguiente</button>
      </div>

      <p className="meta">
        {cargando ? 'Cargando...' : `${lectivos} dias de clase este mes.`}
        {puedeEditar && ' Puede cambiar el tipo de cualquier dia.'}
      </p>
      {error && <p role="alert" className="error">{error}</p>}

      <div className="calendario" role="grid" aria-label={`Calendario de ${MESES[mes]} de ${anio}`}>
        {CABECERAS.map((c) => (
          <div key={c} className="calendario-cabecera" role="columnheader">{c}</div>
        ))}
        {Array.from({ length: huecos }, (_, i) => (
          <div key={`hueco-${i}`} className="calendario-hueco" role="gridcell" />
        ))}
        {Array.from({ length: ultimo.getDate() }, (_, i) => {
          const dia = i + 1;
          const fecha = fechaISO(anio, mes, dia);
          const info = dias[fecha];
          const tipo = info?.dayType;
          // Sin dato: fin de semana o fecha fuera del ano escolar sembrado.
          const clase = tipo ? `dia-${tipo.toLowerCase()}` : 'dia-sin-clase';
          const etiqueta = tipo ? ETIQUETA[tipo] : 'sin clase';

          return (
            <div key={fecha} role="gridcell" className={`calendario-dia ${clase}`}
                 aria-label={`${dia} de ${MESES[mes]}: ${etiqueta}`}>
              <span className="numero">{dia}</span>
              <span className="tipo">{etiqueta}</span>
              {info?.description && <span className="motivo">{info.description}</span>}
              {puedeEditar && info && (
                <select aria-label={`Tipo de dia para ${fecha}`} value={tipo}
                        onChange={(e) => void cambiar(fecha, e.target.value as DayType)}>
                  {TIPOS.map((t) => <option key={t} value={t}>{ETIQUETA[t]}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>

      <div className="leyenda">
        {TIPOS.map((t) => (
          <span key={t}><i className={`muestra dia-${t.toLowerCase()}`} />{ETIQUETA[t]}</span>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Añadir los estilos a `styles.css`**

```css
/* Calendario escolar: cuadricula de siete columnas, una por dia de la semana. */
.calendario { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin: 12px 0; }
.calendario-cabecera { text-align: center; font-size: .8rem; color: var(--tinta-suave);
                       padding: 4px 0; font-weight: 700; }
.calendario-hueco { min-height: 76px; }
.calendario-dia { min-height: 76px; border: 1px solid var(--rejilla); border-radius: 6px;
                  padding: 4px 6px; display: flex; flex-direction: column; gap: 2px;
                  font-size: .75rem; }
.calendario-dia .numero { font-weight: 700; font-size: .95rem; }
.calendario-dia .tipo { color: var(--tinta-suave); }
.calendario-dia .motivo { color: var(--tinta-mute); font-size: .7rem; }
.calendario-dia select { font-size: .7rem; padding: 2px; min-height: 0; margin-top: auto; }

/* El color acompana a la etiqueta escrita, nunca la sustituye. */
.dia-lectivo       { background: #eaf6ec; }
.dia-festivo       { background: #fdecec; }
.dia-vacaciones    { background: #eef2fb; }
.dia-institucional { background: #fdf6e3; }
.dia-suspendido    { background: #f4e9f7; }
.dia-sin-clase     { background: var(--fondo); color: var(--tinta-mute); }

.muestra { width: 14px; height: 14px; border-radius: 3px; display: inline-block;
           border: 1px solid var(--rejilla); }

/* En un telefono, siete columnas con texto no caben: se deja solo el numero y el color,
   y la etiqueta escrita sigue estando en el aria-label para el lector de pantalla. */
@media (max-width: 560px) {
  .calendario-dia { min-height: 52px; }
  .calendario-dia .tipo, .calendario-dia .motivo { display: none; }
}
```

- [ ] **Step 5: Añadir la ruta en `App.tsx`**

```tsx
      <Route path="/calendario" element={<Protegida><Calendario /></Protegida>} />
```
con `import Calendario from './pages/Calendario';`.

- [ ] **Step 6: Ejecutar los tests**

Run: `cd app/frontend && npm test && npm run build`
Expected: PASS todo, paquete por debajo de 200 KB gzip.

- [ ] **Step 7: Anotar el recorrido manual, que se hace en la Task 9**

La base local todavía no está sembrada, así que esto **no se ejecuta aquí**: se deja
apuntado y se recorre entero en la Task 9 Step 5, con datos de verdad. No marcar la
casilla como hecha "porque los tests pasan": son cosas distintas.

Con la base sembrada y la aplicación levantada, abrir `/calendario`:
1. El mes en curso se pinta y los festivos aparecen en su color **con la palabra**.
2. Como docente **no** hay desplegables; como coordinación sí.
3. Cambiar un día a "suspendido" y comprobar que en `/asistencia` ese día ya no deja marcar.
4. En un teléfono estrecho (DevTools, 360 px) la cuadrícula no desborda.

- [ ] **Step 8: Commit**

```bash
git add app/frontend
git commit -m "feat: calendario escolar en cuadricula de mes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Horario semanal, y entrar a tomar la lista desde ahí

**Files:**
- Create: `app/frontend/src/pages/Horario.tsx`
- Test: `app/frontend/src/pages/Horario.test.tsx`
- Modify: `app/frontend/src/pages/TomarAsistencia.tsx`
- Modify: `app/frontend/src/App.tsx`
- Modify: `app/frontend/src/styles.css`

**Interfaces:**
- Consumes: `GET /api/schedule/week` (Task 2).
- Produces: ruta `/horario`. Los enlaces "Tomar la lista" navegan a `/asistencia?bloque={id}`, y `TomarAsistencia` preselecciona ese bloque.

Esta es la pantalla que pidió el colegio con más detalle: *"que el docente pueda ver en
dónde tiene clase, tener su horario en el celular, y decir «voy a tomar la lista de tal
curso»"*. Las tres cosas son la misma pantalla si desde cada casilla se puede entrar a
marcar.

**El bloque de hoy se resalta**, porque el docente que abre el horario a las 7 de la
mañana quiere ver el suyo, no leer una rejilla de treinta casillas.

- [ ] **Step 1: Escribir los tests**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Horario from './Horario';

const SEMANA = [
  { id: 11, grade: '601', weekday: 1, blockNo: 1, subject: 'Ciencias',
    startTime: '06:30', endTime: '07:20', room: 'Aula 201', teacherName: 'Pepito Perez' },
  { id: 12, grade: '602', weekday: 3, blockNo: 4, subject: 'Matematicas',
    startTime: '09:15', endTime: '10:05', room: 'Laboratorio 1', teacherName: 'Pepito Perez' },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function pintar() {
  return render(
    <MemoryRouter initialEntries={['/horario']}>
      <Routes>
        <Route path="/horario" element={<Horario />} />
        <Route path="/asistencia" element={<p>pantalla de asistencia</p>} />
      </Routes>
    </MemoryRouter>);
}

describe('Horario', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'DOCENTE',
      fullName: 'Pepito Perez', userId: 3, mustChangePassword: false,
    }));
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(SEMANA)));
  });

  it('muestra curso, materia y aula de cada bloque', async () => {
    pintar();
    await waitFor(() => expect(screen.getByText(/Ciencias/)).toBeInTheDocument());
    expect(screen.getByText(/601/)).toBeInTheDocument();
    // "Donde tengo clase" es la pregunta que motivo esta pantalla.
    expect(screen.getByText(/Aula 201/)).toBeInTheDocument();
    expect(screen.getByText(/Laboratorio 1/)).toBeInTheDocument();
  });

  it('coloca cada bloque en su dia', async () => {
    pintar();
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());
    expect(screen.getByLabelText(/lunes.*bloque 1.*Ciencias/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/miercoles.*bloque 4.*Matematicas/i)).toBeInTheDocument();
  });

  it('desde un bloque se entra a tomar la lista de ese curso', async () => {
    pintar();
    await waitFor(() => expect(screen.getByText(/Ciencias/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('link', { name: /tomar la lista de 601/i }));
    expect(await screen.findByText('pantalla de asistencia')).toBeInTheDocument();
  });

  it('un horario vacio lo dice, en vez de mostrar una rejilla en blanco', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([])));
    pintar();
    await waitFor(() =>
      expect(screen.getByText(/no tiene bloques asignados/i)).toBeInTheDocument());
  });

  it('sin conexion lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    pintar();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i));
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd app/frontend && npm test src/pages/Horario.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir `Horario.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../api/client';

type Bloque = {
  id: number; grade: string; weekday: number; blockNo: number; subject: string;
  startTime: string; endTime: string; room?: string; teacherName?: string;
};

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

/** Dia de la semana de hoy en formato 1..5; 0 si es fin de semana. */
function diaDeHoy(): number {
  const d = new Date().getDay();
  return d >= 1 && d <= 5 ? d : 0;
}

export default function Horario() {
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [curso, setCurso] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const puedeVerCursos = ['COORDINADOR', 'ADMIN'].includes(getSession()?.role ?? '');
  const hoy = diaDeHoy();

  useEffect(() => {
    setCargando(true);
    setError('');
    api.get<Bloque[]>(`/api/schedule/week${curso ? `?grade=${encodeURIComponent(curso)}` : ''}`)
       .then(setBloques)
       .catch(() => setError('No se pudo cargar el horario. Requiere conexion.'))
       .finally(() => setCargando(false));
  }, [curso]);

  const numeros = [...new Set(bloques.map((b) => b.blockNo))].sort((a, b) => a - b);

  return (
    <main className="card ancha">
      <h1>{curso ? `Horario del curso ${curso}` : 'Mi horario'}</h1>

      {puedeVerCursos && (
        <div className="leyenda" style={{ marginBottom: 12 }}>
          <label htmlFor="curso-horario">Ver el horario de un curso</label>
          <input id="curso-horario" value={curso} placeholder="601 (vacio = el mio)"
                 onChange={(e) => setCurso(e.target.value.trim())} />
        </div>
      )}

      {error && <p role="alert" className="error">{error}</p>}
      {cargando && <p className="meta">Cargando...</p>}

      {!cargando && !error && bloques.length === 0 && (
        <p className="meta">
          {curso
            ? `El curso ${curso} no tiene bloques asignados en el horario.`
            : 'No tiene bloques asignados en el horario. Avise a coordinacion.'}
        </p>
      )}

      {bloques.length > 0 && (
        <div className="tabla-scroll">
          <div className="horario" role="grid" aria-label="Horario semanal"
               style={{ gridTemplateColumns: `auto repeat(${DIAS.length}, 1fr)` }}>
            <div className="horario-esquina" role="columnheader" />
            {DIAS.map((d, i) => (
              <div key={d} role="columnheader"
                   className={`horario-cabecera ${hoy === i + 1 ? 'hoy' : ''}`}>
                {d}{hoy === i + 1 && <span className="etiqueta-hoy">hoy</span>}
              </div>
            ))}

            {numeros.map((n) => (
              <div key={`fila-${n}`} style={{ display: 'contents' }}>
                <div className="horario-bloque" role="rowheader">
                  <strong>{n}</strong>
                  <small>{bloques.find((b) => b.blockNo === n)?.startTime}</small>
                </div>
                {DIAS.map((dia, i) => {
                  const b = bloques.find((x) => x.blockNo === n && x.weekday === i + 1);
                  if (!b) {
                    return <div key={`${n}-${i}`} role="gridcell" className="horario-celda vacia" />;
                  }
                  return (
                    <div key={`${n}-${i}`} role="gridcell"
                         className={`horario-celda ${hoy === b.weekday ? 'hoy' : ''}`}
                         aria-label={`${dia}, bloque ${b.blockNo}: ${b.subject}, curso ${b.grade}`
                                     + (b.room ? `, en ${b.room}` : '')}>
                      <strong>{b.grade}</strong>
                      <span>{b.subject}</span>
                      {b.room && <small className="aula">{b.room}</small>}
                      {b.teacherName && curso && <small>{b.teacherName}</small>}
                      {!curso && (
                        <Link to={`/asistencia?bloque=${b.id}`} className="tomar-lista">
                          Tomar la lista de {b.grade}
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
```

El enlace de tomar la lista solo aparece en **el horario propio**: coordinación mirando
el horario de un curso no va a marcar la asistencia de otro.

- [ ] **Step 4: Que `TomarAsistencia` acepte el bloque por la URL**

Añadir el import y leer el parámetro:

```tsx
import { useSearchParams } from 'react-router-dom';
```

Dentro del componente, tras los estados que ya existen:

```tsx
  const [parametros] = useSearchParams();

  // Se llega aqui desde el horario con ?bloque=N. Se preselecciona el curso y el bloque
  // para que el docente no tenga que buscarlos otra vez.
  useEffect(() => {
    const pedido = Number(parametros.get('bloque'));
    if (!pedido || blocks.length === 0) return;
    const b = blocks.find((x) => x.id === pedido);
    if (!b) return;
    setGrade(b.grade);
    setBlockId(b.id);
  }, [parametros, blocks]);
```

**Va después del efecto que carga `blocks`**, y depende de él: sin los bloques
descargados no se puede resolver el identificador. Si el bloque no está en la copia
local, no se hace nada y el docente elige a mano.

- [ ] **Step 5: Añadir los estilos**

```css
/* Horario semanal: una columna por dia, una fila por bloque. */
.horario { display: grid; gap: 4px; min-width: 640px; }
.horario-esquina { }
.horario-cabecera { text-align: center; font-weight: 700; padding: 6px 0;
                    text-transform: capitalize; color: var(--tinta-suave); }
.horario-cabecera.hoy { color: var(--tinta); }
.etiqueta-hoy { display: block; font-size: .65rem; font-weight: 400; color: var(--ocre); }
.horario-bloque { display: flex; flex-direction: column; align-items: center;
                  justify-content: center; padding: 0 8px; color: var(--tinta-suave); }
.horario-bloque small { font-size: .7rem; }
.horario-celda { border: 1px solid var(--rejilla); border-radius: 6px; padding: 6px;
                 display: flex; flex-direction: column; gap: 2px; font-size: .78rem;
                 min-height: 72px; }
.horario-celda.vacia { background: var(--fondo); border-style: dashed; }
/* El bloque de hoy se distingue: el docente que abre esto a las 7 quiere ver el suyo. */
.horario-celda.hoy { border-color: var(--verde); background: #f2f8f4; }
.horario-celda .aula { color: var(--ocre); font-weight: 700; }
.tomar-lista { margin-top: auto; font-size: .72rem; }
```

- [ ] **Step 6: Añadir la ruta en `App.tsx`**

```tsx
      <Route path="/horario" element={<Protegida><Horario /></Protegida>} />
```
con `import Horario from './pages/Horario';`.

- [ ] **Step 7: Ejecutar los tests**

Run: `cd app/frontend && npm test && npm run build`
Expected: PASS todo.

- [ ] **Step 8: Anotar el recorrido manual, que se hace en la Task 9**

Igual que en el calendario: sin base sembrada esto no se puede ver. Se recorre en la
Task 7 Step 5.

Con la base sembrada y la aplicación levantada, entrar como `profe1@ggm.edu.co`:
1. `/horario` muestra su semana con curso, materia y **aula**.
2. La columna de hoy está resaltada.
3. Pulsar "Tomar la lista de 6xx" lleva a `/asistencia` **con el curso y el bloque ya
   elegidos**, y la lista de estudiantes cargada.
4. Como coordinación, escribir `601` muestra el horario de ese curso **con el nombre del
   docente** y sin enlaces para marcar.

El punto 3 es el que pidió el colegio: *"decir yo tomaré la lista de tal curso"*.

- [ ] **Step 9: Commit**

```bash
git add app/frontend
git commit -m "feat: horario semanal con aula, y tomar la lista desde el bloque

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Barra lateral y armazón de la aplicación

**Files:**
- Create: `app/frontend/src/components/Menu.tsx`
- Create: `app/frontend/src/components/Layout.tsx`
- Test: `app/frontend/src/components/Menu.test.tsx`
- Modify: `app/frontend/src/App.tsx`
- Modify: `app/frontend/src/styles.css`

**Interfaces:**
- Consumes: `getSession()` y `clearSession()` de `src/api/client.ts`.
- Produces: `<Layout>` envuelve todas las rutas protegidas y pinta la barra lateral con los destinos que corresponden al rol.

Hoy la navegación son enlaces sueltos en el inicio: para ir de Consultas a Calendario hay
que volver atrás. Con siete destinos eso ya no se sostiene.

**En el teléfono la barra no puede ocupar espacio permanente**: se convierte en un cajón
que se abre con un botón. El docente trabaja en una pantalla de 390 px con cuarenta
estudiantes en lista, y ahí cada píxel cuenta.

- [ ] **Step 1: Escribir los tests**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Menu from './Menu';

function sesion(role: string) {
  localStorage.setItem('ggm.session', JSON.stringify({
    token: 't', refreshToken: 'r', role, fullName: 'Quien Sea',
    userId: 1, mustChangePassword: false,
  }));
}

const pintar = () => render(<MemoryRouter><Menu /></MemoryRouter>);

describe('Menu', () => {
  beforeEach(() => localStorage.clear());

  it('un docente ve lo suyo y no lo de administracion', () => {
    sesion('DOCENTE');
    pintar();
    expect(screen.getByRole('link', { name: /asistencia/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /horario/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /calendario/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /administracion/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tablero/i })).not.toBeInTheDocument();
  });

  it('coordinacion ve el tablero pero no administracion', () => {
    sesion('COORDINADOR');
    pintar();
    expect(screen.getByRole('link', { name: /tablero/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /administracion/i })).not.toBeInTheDocument();
  });

  it('el administrador lo ve todo', () => {
    sesion('ADMIN');
    pintar();
    expect(screen.getByRole('link', { name: /administracion/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tablero/i })).toBeInTheDocument();
  });

  it('un acudiente solo ve lo suyo', () => {
    sesion('ACUDIENTE');
    pintar();
    expect(screen.queryByRole('link', { name: /asistencia a clase/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /administracion/i })).not.toBeInTheDocument();
  });

  it('ofrece cerrar sesion', async () => {
    sesion('DOCENTE');
    pintar();
    expect(screen.getByRole('button', { name: /cerrar sesion/i })).toBeInTheDocument();
  });

  it('en pantalla estrecha el menu se abre y se cierra', async () => {
    sesion('DOCENTE');
    pintar();
    const abrir = screen.getByRole('button', { name: /abrir menu/i });
    await userEvent.click(abrir);
    expect(screen.getByRole('navigation')).toHaveAttribute('data-abierto', 'true');
    await userEvent.click(screen.getByRole('button', { name: /cerrar menu/i }));
    expect(screen.getByRole('navigation')).toHaveAttribute('data-abierto', 'false');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd app/frontend && npm test src/components/Menu.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir `Menu.tsx`**

```tsx
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { clearSession, getSession } from '../api/client';
import Escudo from './Escudo';
import type { Role } from '../api/contract';

type Destino = { a: string; texto: string; roles: Role[] };

/** El orden es el de la jornada: primero lo que se usa a diario. */
const DESTINOS: Destino[] = [
  { a: '/',            texto: 'Inicio',         roles: ['ADMIN', 'COORDINADOR', 'DOCENTE'] },
  { a: '/asistencia',  texto: 'Asistencia a clase', roles: ['ADMIN', 'COORDINADOR', 'DOCENTE'] },
  { a: '/horario',     texto: 'Horario',        roles: ['ADMIN', 'COORDINADOR', 'DOCENTE'] },
  { a: '/calendario',  texto: 'Calendario',     roles: ['ADMIN', 'COORDINADOR', 'DOCENTE', 'ACUDIENTE'] },
  { a: '/ingreso',     texto: 'Ingreso al colegio', roles: ['ADMIN', 'COORDINADOR', 'DOCENTE'] },
  { a: '/consultas',   texto: 'Consultas',      roles: ['ADMIN', 'COORDINADOR', 'DOCENTE'] },
  { a: '/dashboard',   texto: 'Tablero',        roles: ['ADMIN', 'COORDINADOR'] },
  { a: '/admin',       texto: 'Administracion', roles: ['ADMIN'] },
];

export default function Menu() {
  const [abierto, setAbierto] = useState(false);
  const sesion = getSession();
  if (!sesion) return null;

  const visibles = DESTINOS.filter((d) => d.roles.includes(sesion.role));

  return (
    <>
      <button type="button" className="menu-boton secundario"
              aria-label={abierto ? 'Cerrar menu' : 'Abrir menu'}
              onClick={() => setAbierto(!abierto)}>
        {abierto ? 'Cerrar menu' : 'Abrir menu'}
      </button>

      <nav className="menu" role="navigation" data-abierto={String(abierto)}
           aria-label="Secciones">
        <div className="menu-marca">
          <Escudo size={40} />
          <div>
            <strong>Asistencia GGM</strong>
            <small>{sesion.fullName}</small>
          </div>
        </div>

        <ul>
          {visibles.map((d) => (
            <li key={d.a}>
              <NavLink to={d.a} end={d.a === '/'}
                       className={({ isActive }) => (isActive ? 'activo' : undefined)}
                       onClick={() => setAbierto(false)}>
                {d.texto}
              </NavLink>
            </li>
          ))}
        </ul>

        <button type="button" className="secundario"
                onClick={() => { clearSession(); location.href = '/login'; }}>
          Cerrar sesion
        </button>
      </nav>
    </>
  );
}
```

- [ ] **Step 4: Escribir `Layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import Menu from './Menu';

/** Armazon de las pantallas con sesion: barra lateral fija y el contenido al lado. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="armazon">
      <Menu />
      <div className="contenido">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: Envolver las rutas protegidas en `App.tsx`**

`Protegida` y `SoloRoles` ya envuelven cada ruta; se les añade el armazón en un solo
sitio para no repetirlo ocho veces:

```tsx
function Protegida({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.mustChangePassword && location.pathname !== '/cambiar-clave') {
    return <Navigate to="/cambiar-clave" replace />;
  }
  return <Layout>{children}</Layout>;
}
```

Hacer lo mismo en `SoloRoles`. **`/login` y `/cambiar-clave` quedan fuera del armazón**:
sin sesión no hay menú que pintar, y con la contraseña temporal no hay a dónde ir.

- [ ] **Step 6: Añadir los estilos**

```css
/* Armazon: barra lateral fija en escritorio, cajon en el telefono. */
.armazon { display: grid; grid-template-columns: 15rem 1fr; min-height: 100vh; }
.contenido { min-width: 0; }   /* sin esto, una tabla ancha desborda la rejilla */

.menu { background: var(--superficie); border-right: 1px solid var(--rejilla);
        padding: 16px 12px; display: flex; flex-direction: column; gap: 16px; }
.menu-marca { display: flex; gap: 10px; align-items: center; }
.menu-marca strong { display: block; font-size: .95rem; }
.menu-marca small { color: var(--tinta-suave); font-size: .78rem; }
.menu ul { list-style: none; padding: 0; margin: 0; display: flex;
           flex-direction: column; gap: 2px; }
.menu a { display: block; padding: 10px 12px; border-radius: 6px; text-decoration: none;
          color: var(--tinta); font-size: .92rem; }
.menu a:hover { background: var(--fondo); }
.menu a.activo { background: var(--verde); color: #fff; font-weight: 700; }
.menu > button { margin-top: auto; }
.menu-boton { display: none; }

@media (max-width: 900px) {
  .armazon { grid-template-columns: 1fr; }
  .menu-boton { display: block; position: sticky; top: 0; z-index: 20;
                width: 100%; border-radius: 0; }
  /* El docente trabaja en 390 px con cuarenta estudiantes en lista: la barra no puede
     ocupar espacio permanente, asi que se convierte en cajon. */
  .menu[data-abierto='false'] { display: none; }
  .menu[data-abierto='true']  { display: flex; border-right: 0;
                                border-bottom: 1px solid var(--rejilla); }
}
```

- [ ] **Step 7: Quitar los enlaces sueltos de `Home.tsx`**

El bloque `<nav className="acciones">` con los enlaces a Asistencia, Ingreso, Consultas,
Tablero y Administración **se elimina**: ahora viven en la barra. `Home` se queda con el
saludo, el aviso de bloques pendientes, "Actualizar datos" y el botón de instalar.

- [ ] **Step 8: Ejecutar los tests**

Run: `cd app/frontend && npm test && npm run build`
Expected: PASS todo. **Los tests de `Home` que buscaban esos enlaces fallarán**: hay que
borrar esas comprobaciones, porque el comportamiento se movió a `Menu` y allí ya está
probado. Es un cambio de sitio, no una pérdida de cobertura.

- [ ] **Step 9: Mirarlo en las dos anchuras**

Con la aplicación levantada:
1. En escritorio, la barra está siempre visible y marca en qué sección se está.
2. A 390 px, la barra desaparece y aparece el botón; al elegir un destino, se cierra sola.
3. Como docente no aparecen "Tablero" ni "Administracion".

- [ ] **Step 10: Commit**

```bash
git add app/frontend
git commit -m "feat: barra lateral de navegacion, cajon en el telefono

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: El administrador aterriza en el día de hoy

**Files:**
- Create: `app/backend/src/main/java/co/edu/ggm/asistencia/service/TodayService.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/repository/ReportRepository.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/ReportController.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/report/HoyTest.java`
- Create: `app/frontend/src/pages/InicioAdmin.tsx`
- Test: `app/frontend/src/pages/InicioAdmin.test.tsx`
- Modify: `app/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `attendance`, `entry_log`, `schedule_blocks`, `school_calendar`, `CalendarService.isSchoolDay`.
- Produces: `GET /api/reports/today` (COORDINADOR, ADMIN) ->
  `{"lectivo":boolean, "fecha":"YYYY-MM-DD", "bloquesEsperados":int, "bloquesMarcados":int, "presentes":int, "tarde":int, "ausentes":int, "evasiones":int, "ingresos":int, "mesAsistencia":number, "mesDiasLectivos":int}`

El administrador entra por la mañana con una pregunta concreta: **¿cómo va hoy?**. El
tablero que existe responde por el mes, que es otra pregunta. Este responde la de hoy y
deja el mes como contexto al pie.

**`bloquesMarcados` de `bloquesEsperados` es el número que importa**, más que el
porcentaje de asistencia: dice cuánto del colegio ha reportado. Un 100 % de asistencia
sobre 3 bloques de 36 no es una buena noticia, es un aviso.

- [ ] **Step 1: Escribir el test del backend**

```java
package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.TodayService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Se prueba el servicio con una fecha explicita, no el endpoint con "hoy": un test que
 * dependa del dia se salta los fines de semana y deja el arreglo sin verificar, que es
 * exactamente lo que ya paso una vez con los bloques pendientes.
 */
@AutoConfigureMockMvc
class HoyTest extends AbstractIntegrationTest {

    private static final LocalDate LUNES = LocalDate.parse("2026-03-09");

    @Autowired MockMvc mvc;
    @Autowired TodayService hoy;

    private Long bloqueId;
    private Long docenteId;

    @BeforeEach
    void datos() {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('hoy@hoytest.co', 'x', 'Docente Hoy', 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """);
        docenteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'hoy@hoytest.co'", Long.class);
        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('MateriaHoy') ON CONFLICT (name) DO NOTHING");
        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES ('7770000001','UNO','HOY','777',TRUE), ('7770000002','DOS','HOY','777',TRUE)
                ON CONFLICT (document_id) DO NOTHING
                """);
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id)
                VALUES ('777', 1, 6, '12:00', '12:50',
                        (SELECT id FROM subjects WHERE name='MateriaHoy'), ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                """, docenteId);
        bloqueId = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade='777' AND block_no=6", Long.class);
        jdbcBase.update("DELETE FROM attendance WHERE schedule_block_id = ?", bloqueId);
    }

    private void marcar(String documento, String estado) {
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, recorded_by, recorded_at)
                VALUES (gen_random_uuid(), (SELECT id FROM students WHERE document_id = ?),
                        ?, ?, ?, ?, now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot DO UPDATE SET status = EXCLUDED.status
                """, documento, bloqueId, LUNES, estado, docenteId);
    }

    @Test
    void un_dia_lectivo_sin_nada_marcado_lo_dice() {
        var r = hoy.resumen(LUNES);
        assertThat(r.lectivo()).isTrue();
        assertThat(r.bloquesEsperados()).isGreaterThan(0);
        assertThat(r.presentes() + r.tarde() + r.ausentes() + r.evasiones()).isZero();
    }

    @Test
    void cuenta_los_estados_de_hoy() {
        marcar("7770000001", "P");
        marcar("7770000002", "F");
        var r = hoy.resumen(LUNES);
        assertThat(r.presentes()).isEqualTo(1);
        assertThat(r.ausentes()).isEqualTo(1);
    }

    @Test
    void cuenta_cuantos_bloques_han_reportado() {
        marcar("7770000001", "P");
        marcar("7770000002", "P");
        // El bloque de 777 esta completo; los demas del lunes siguen sin marcar.
        assertThat(hoy.resumen(LUNES).bloquesMarcados()).isGreaterThanOrEqualTo(1);
        assertThat(hoy.resumen(LUNES).bloquesMarcados())
                .isLessThanOrEqualTo(hoy.resumen(LUNES).bloquesEsperados());
    }

    @Test
    void un_dia_no_lectivo_no_espera_ningun_bloque() {
        // 2026-03-08 es domingo
        var r = hoy.resumen(LocalDate.parse("2026-03-08"));
        assertThat(r.lectivo()).isFalse();
        assertThat(r.bloquesEsperados()).isZero();
    }

    @Test
    void un_docente_no_puede_ver_el_resumen_del_colegio() throws Exception {
        mvc.perform(get("/api/reports/today")
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE")))
           .andExpect(status().isForbidden());
    }

    @Test
    void coordinacion_si_puede() throws Exception {
        mvc.perform(get("/api/reports/today")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isOk());
    }
}
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest=HoyTest`
Expected: FAIL — no existe `TodayService`.

- [ ] **Step 3: Añadir las consultas a `ReportRepository`**

```java
    @Query(value = """
            SELECT count(*) FROM schedule_blocks WHERE weekday = :weekday
            """, nativeQuery = true)
    int countBlocksOfWeekday(@Param("weekday") int weekday);

    @Query(value = """
            SELECT count(*) FROM schedule_blocks b
            WHERE b.weekday = :weekday
              AND (SELECT count(*) FROM attendance a
                    WHERE a.schedule_block_id = b.id AND a.class_date = :day)
                  >= (SELECT count(*) FROM students s WHERE s.grade = b.grade AND s.active)
              AND EXISTS (SELECT 1 FROM students s WHERE s.grade = b.grade AND s.active)
            """, nativeQuery = true)
    int countBlocksReported(@Param("weekday") int weekday, @Param("day") LocalDate day);

    interface DayCounts {
        int getPresentes();
        int getTarde();
        int getAusentes();
        int getEvasiones();
    }

    @Query(value = """
            SELECT count(*) FILTER (WHERE status = 'P') AS presentes,
                   count(*) FILTER (WHERE status = 'T') AS tarde,
                   count(*) FILTER (WHERE status = 'F') AS ausentes,
                   count(*) FILTER (WHERE status = 'E') AS evasiones
            FROM attendance WHERE class_date = :day
            """, nativeQuery = true)
    DayCounts countsOfDay(@Param("day") LocalDate day);

    @Query(value = "SELECT count(*) FROM entry_log WHERE entry_date = :day", nativeQuery = true)
    int countEntries(@Param("day") LocalDate day);
```

`countBlocksReported` cuenta un bloque como reportado **solo si tiene registro de todos
sus estudiantes activos**, igual que el aviso de pendientes: media clase marcada no es
una clase marcada.

- [ ] **Step 4: Escribir `TodayService`**

```java
package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.repository.ReportRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;

@Service
public class TodayService {

    public static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final ReportRepository repo;
    private final CalendarService calendar;

    public TodayService(ReportRepository repo, CalendarService calendar) {
        this.repo = repo; this.calendar = calendar;
    }

    public record ResumenDeHoy(boolean lectivo, LocalDate fecha,
                               int bloquesEsperados, int bloquesMarcados,
                               int presentes, int tarde, int ausentes, int evasiones,
                               int ingresos,
                               double mesAsistencia, int mesDiasLectivos) {}

    public ResumenDeHoy resumen(LocalDate dia) {
        boolean lectivo = calendar.isSchoolDay(dia);
        int weekday = dia.getDayOfWeek().getValue();

        // Un dia no lectivo no espera ningun bloque: decir "0 de 36" un domingo seria
        // dar una alarma falsa todos los fines de semana.
        int esperados = lectivo ? repo.countBlocksOfWeekday(weekday) : 0;
        int marcados = lectivo ? repo.countBlocksReported(weekday, dia) : 0;

        var c = repo.countsOfDay(dia);

        LocalDate inicioMes = dia.withDayOfMonth(1);
        var mes = repo.countsOfDay(inicioMes);   // se sustituye abajo por el rango
        int diasLectivosMes = repo.countSchoolDays(inicioMes, dia);
        var porCurso = repo.byGrade(null, inicioMes, dia);
        int presentesMes = porCurso.stream().mapToInt(g -> g.getPresent() + g.getLate()).sum();
        int totalMes = porCurso.stream()
                .mapToInt(g -> g.getPresent() + g.getLate() + g.getAbsent() + g.getEvasion())
                .sum();
        double asistenciaMes = totalMes == 0 ? 0.0
                : Math.round(1000.0 * presentesMes / totalMes) / 10.0;

        return new ResumenDeHoy(lectivo, dia, esperados, marcados,
                c.getPresentes(), c.getTarde(), c.getAusentes(), c.getEvasiones(),
                repo.countEntries(dia), asistenciaMes, diasLectivosMes);
    }
}
```

Borrar la línea `var mes = repo.countsOfDay(inicioMes);`: quedó de una versión anterior y
no se usa. El dato del mes sale de `byGrade`, que ya agrega por rango.

- [ ] **Step 5: Añadir el endpoint a `ReportController`**

```java
    @GetMapping("/today")
    @PreAuthorize("hasAnyRole('COORDINADOR','ADMIN')")
    public TodayService.ResumenDeHoy today() {
        return todayService.resumen(LocalDate.now(TodayService.BOGOTA));
    }
```

Inyectar `TodayService todayService` en el constructor.

- [ ] **Step 6: Ejecutar los tests del backend**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
Expected: PASS todo, en los tres órdenes de ejecución.

- [ ] **Step 7: Escribir el test de la pantalla**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InicioAdmin from './InicioAdmin';

const HOY = {
  lectivo: true, fecha: '2026-08-24',
  bloquesEsperados: 36, bloquesMarcados: 12,
  presentes: 320, tarde: 14, ausentes: 22, evasiones: 4,
  ingresos: 380, mesAsistencia: 94.6, mesDiasLectivos: 16,
};

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const pintar = () => render(<MemoryRouter><InicioAdmin /></MemoryRouter>);

describe('InicioAdmin', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ADMIN',
      fullName: 'Administrador', userId: 1, mustChangePassword: false,
    }));
  });

  it('lo primero que muestra es cuanto del colegio ha reportado hoy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HOY)));
    pintar();
    // Un 100 % de asistencia sobre 3 bloques de 36 no es buena noticia: por eso la
    // cobertura va antes que el porcentaje.
    await waitFor(() => expect(screen.getByText(/12 de 36/)).toBeInTheDocument());
  });

  it('muestra los estados de hoy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HOY)));
    pintar();
    await waitFor(() => expect(screen.getByText('22')).toBeInTheDocument());
    expect(screen.getByText(/ausentes hoy/i)).toBeInTheDocument();
  });

  it('muestra el mes como contexto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HOY)));
    pintar();
    await waitFor(() => expect(screen.getByText(/94.6/)).toBeInTheDocument());
    expect(screen.getByText(/16 dias lectivos/i)).toBeInTheDocument();
  });

  it('un dia no lectivo lo dice en vez de alarmar con ceros', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({
      ...HOY, lectivo: false, bloquesEsperados: 0, bloquesMarcados: 0,
      presentes: 0, tarde: 0, ausentes: 0, evasiones: 0, ingresos: 0,
    })));
    pintar();
    await waitFor(() => expect(screen.getByText(/hoy no hay clase/i)).toBeInTheDocument());
    expect(screen.queryByText(/0 de 0/)).not.toBeInTheDocument();
  });

  it('sin conexion lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    pintar();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i));
  });
});
```

- [ ] **Step 8: Ejecutar y ver que falla**

Run: `cd app/frontend && npm test src/pages/InicioAdmin.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 9: Escribir `InicioAdmin.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../api/client';
import Kpi from '../components/charts/Kpi';

type ResumenHoy = {
  lectivo: boolean; fecha: string;
  bloquesEsperados: number; bloquesMarcados: number;
  presentes: number; tarde: number; ausentes: number; evasiones: number;
  ingresos: number; mesAsistencia: number; mesDiasLectivos: number;
};

const fechaLarga = (iso: string) =>
  new Date(`${iso}T00:00`).toLocaleDateString('es-CO',
    { weekday: 'long', day: 'numeric', month: 'long' });

export default function InicioAdmin() {
  const [hoy, setHoy] = useState<ResumenHoy | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get<ResumenHoy>('/api/reports/today')
       .then(setHoy)
       .catch(() => setError('No se pudo cargar el resumen de hoy. Requiere conexion.'))
       .finally(() => setCargando(false));
  }, []);

  const faltan = hoy ? hoy.bloquesEsperados - hoy.bloquesMarcados : 0;

  return (
    <main className="card ancha">
      <p className="meta">Hola, {getSession()?.fullName}</p>
      <h1>{hoy ? fechaLarga(hoy.fecha) : 'Hoy'}</h1>

      {error && <p role="alert" className="error">{error}</p>}
      {cargando && <p className="meta">Cargando...</p>}

      {hoy && !hoy.lectivo && (
        <p className="banner no-lectivo" role="status">
          Hoy no hay clase segun el calendario escolar.
        </p>
      )}

      {hoy && hoy.lectivo && (
        <>
          <div className="kpis">
            <Kpi valor={`${hoy.bloquesMarcados} de ${hoy.bloquesEsperados}`}
                 etiqueta="Bloques con asistencia tomada" alerta={faltan > 0} />
            <Kpi valor={hoy.ausentes} etiqueta="Ausentes hoy" alerta={hoy.ausentes > 0} />
            <Kpi valor={hoy.tarde} etiqueta="Llegadas tarde hoy" />
            <Kpi valor={hoy.evasiones} etiqueta="Evasiones hoy" alerta={hoy.evasiones > 0} />
            <Kpi valor={hoy.ingresos} etiqueta="Ingresos por porteria" />
          </div>

          {faltan > 0 && (
            <p className="meta">
              Faltan <strong>{faltan}</strong> bloques por reportar.{' '}
              <Link to="/consultas">Ver el detalle</Link>
            </p>
          )}
        </>
      )}

      {hoy && (
        <div className="grafica">
          <h3>En lo que va del mes</h3>
          <div className="kpis">
            <Kpi valor={hoy.mesAsistencia.toFixed(1)} sufijo="%" etiqueta="Asistencia del mes" />
            <Kpi valor={hoy.mesDiasLectivos} etiqueta="Dias lectivos transcurridos" />
          </div>
          <p className="meta"><Link to="/dashboard">Ver el tablero completo</Link></p>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 10: Enrutar el inicio según el rol**

En `App.tsx`, el componente `Inicio` ya reparte para el acudiente; se amplía:

```tsx
function Inicio() {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.role === 'ACUDIENTE') return <Padre />;
  // Coordinacion y administracion entran preguntando "como va hoy"; el docente entra
  // a tomar la lista, asi que su inicio sigue siendo el de siempre.
  if (session.role === 'ADMIN' || session.role === 'COORDINADOR') return <InicioAdmin />;
  return <Home />;
}
```
con `import InicioAdmin from './pages/InicioAdmin';`.

- [ ] **Step 11: Ejecutar los tests**

Run: `cd app/frontend && npm test && npm run build`
Expected: PASS todo, paquete por debajo de 200 KB gzip.

- [ ] **Step 12: Comprobarlo con datos reales**

Con la base local sembrada y la aplicación levantada:
1. Entrar como `admin@ggm.edu.co` → aterriza en el resumen de hoy, no en un menú.
2. El primer número es **cuántos bloques han reportado**, y si faltan, se dice.
3. Marcar la asistencia de un curso como docente y recargar: el contador sube.
4. Cambiar hoy a `SUSPENDIDO` en el calendario y recargar: dice "Hoy no hay clase" en
   vez de mostrar ceros alarmantes.

- [ ] **Step 13: Ejecutar la prueba de humo**

Run: levantar la aplicación y `bash tools/humo.sh http://localhost:8080`
Expected: los invariantes se mantienen.

- [ ] **Step 14: Commit**

```bash
git add app/backend app/frontend
git commit -m "feat: el administrador aterriza en el resumen del dia

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: El docente aterriza en su dia

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/repository/ScheduleRepository.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/ScheduleController.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/schedule/MiDiaTest.java`
- Create: `app/frontend/src/pages/InicioDocente.tsx`
- Test: `app/frontend/src/pages/InicioDocente.test.tsx`
- Modify: `app/frontend/src/App.tsx`
- Modify: `app/frontend/src/styles.css`

**Interfaces:**
- Consumes: `schedule_blocks` con `room` (Task 1), `attendance`, el servicio de calendario ya existente.
- Produces: `GET /api/schedule/my-day?fecha=YYYY-MM-DD` (personal del colegio) ->
  `{"lectivo":boolean, "fecha":"YYYY-MM-DD", "motivo":string|null, "bloques":[{id, blockNo, grade, subject, room, startTime, endTime, marcados:int, estudiantes:int}]}`
- Produces: la ruta `/` muestra `InicioDocente` cuando el rol es DOCENTE.

El docente llega al colegio y lo primero que necesita saber es **donde tiene clase**, y
despues **de que cursos ya paso lista**. Hoy tiene que abrir el horario, buscar el dia, y
luego ir curso por curso adivinando si ya marco.

`marcados` de `estudiantes` es el dato que importa, no un si/no: un bloque con 3 de 40
marcados no esta tomado, esta a medias, y eso es justo lo que un booleano esconde.

**El parametro `fecha` existe para poder probar la pantalla sin depender del reloj.** Sin
el, el servidor usa hoy.

- [ ] **Step 1: Escribir el test del backend**

```java
package co.edu.ggm.asistencia.schedule;

import co.edu.ggm.asistencia.support.TestDatabaseConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.greaterThan;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestDatabaseConfig.class)
class MiDiaTest {

    @Autowired MockMvc mvc;

    /** Un lunes lectivo. La fecha va fija a proposito: nada aqui consulta el reloj. */
    private static final String LUNES = "2026-08-03";

    @Test
    void devuelve_los_bloques_del_dia_con_el_aula() throws Exception {
        String docente = tokenDeDocenteConHorario(LUNES, "601", "Ciencias", "Laboratorio 1");
        mvc.perform(get("/api/schedule/my-day?fecha=" + LUNES).header("Authorization", docente))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.lectivo").value(true))
           .andExpect(jsonPath("$.bloques[0].grade").value("601"))
           .andExpect(jsonPath("$.bloques[0].room").value("Laboratorio 1"))
           .andExpect(jsonPath("$.bloques[0].subject").value("Ciencias"));
    }

    @Test
    void dice_cuantos_lleva_marcados_de_cuantos_estudiantes() throws Exception {
        String docente = tokenDeDocenteConHorario(LUNES, "601", "Ciencias", "Laboratorio 1");
        marcarPrimeros(LUNES, "601", 3);
        mvc.perform(get("/api/schedule/my-day?fecha=" + LUNES).header("Authorization", docente))
           .andExpect(jsonPath("$.bloques[0].marcados").value(3))
           .andExpect(jsonPath("$.bloques[0].estudiantes", greaterThan(3)));
    }

    @Test
    void un_bloque_sin_marcar_dice_cero_y_no_se_omite() throws Exception {
        // Omitirlo esconderia justo el bloque que falta por hacer.
        String docente = tokenDeDocenteConHorario(LUNES, "601", "Ciencias", "Laboratorio 1");
        mvc.perform(get("/api/schedule/my-day?fecha=" + LUNES).header("Authorization", docente))
           .andExpect(jsonPath("$.bloques.length()").value(1))
           .andExpect(jsonPath("$.bloques[0].marcados").value(0));
    }

    @Test
    void en_dia_no_lectivo_lo_dice_y_no_devuelve_bloques() throws Exception {
        String docente = tokenDeDocenteConHorario(LUNES, "601", "Ciencias", "Laboratorio 1");
        marcarFestivo("2026-08-07", "Batalla de Boyaca");
        mvc.perform(get("/api/schedule/my-day?fecha=2026-08-07").header("Authorization", docente))
           .andExpect(jsonPath("$.lectivo").value(false))
           .andExpect(jsonPath("$.motivo").value("Batalla de Boyaca"))
           .andExpect(jsonPath("$.bloques.length()").value(0));
    }

    @Test
    void sin_token_responde_401() throws Exception {
        mvc.perform(get("/api/schedule/my-day?fecha=" + LUNES))
           .andExpect(status().isUnauthorized());
    }
}
```

Los metodos `tokenDeDocenteConHorario`, `marcarPrimeros` y `marcarFestivo` son siembra de
prueba. **Mira primero como siembran los tests que ya existen** (`HorarioTest`,
`BootstrapTest`) y sigue esa misma via: si hay una clase de apoyo compartida, anade ahi lo
que falte; si cada test siembra por su cuenta, haz lo mismo dentro de este. No crees un
mecanismo nuevo de siembra.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/backend && mvn -q test -Dtest=MiDiaTest`
Expected: FAIL con 404 en las cuatro primeras.

- [ ] **Step 3: La consulta en `ScheduleRepository`**

```java
    /**
     * Los bloques que el docente dicta ese dia de la semana, con cuantos estudiantes
     * tiene el curso y cuantos lleva marcados en esa fecha.
     *
     * Los conteos van como subconsultas y no como JOIN contra `attendance`: un JOIN
     * dejaria fuera los bloques sin marcar, que son precisamente los que hay que ver.
     */
    @Query(value = """
            SELECT b.id AS id, b.block_no AS blockNo, b.grade AS grade,
                   s.name AS subject, b.room AS room,
                   b.start_time AS startTime, b.end_time AS endTime,
                   (SELECT count(*) FROM students st
                     WHERE st.grade = b.grade AND st.active) AS estudiantes,
                   (SELECT count(*) FROM attendance a
                     WHERE a.schedule_block_id = b.id AND a.class_date = :fecha) AS marcados
              FROM schedule_blocks b
              JOIN subjects s ON s.id = b.subject_id
             WHERE b.teacher_id = :teacherId AND b.weekday = :weekday
             ORDER BY b.block_no
            """, nativeQuery = true)
    List<DayRow> myDay(@Param("teacherId") Long teacherId,
                       @Param("weekday") int weekday,
                       @Param("fecha") LocalDate fecha);

    interface DayRow {
        Long getId(); int getBlockNo(); String getGrade(); String getSubject();
        String getRoom(); LocalTime getStartTime(); LocalTime getEndTime();
        int getEstudiantes(); int getMarcados();
    }
```

Si la columna que marca a un estudiante como activo no se llama `active`, usa la que
exista; miralo en `V1__esquema_inicial.sql` antes de escribir la consulta.

- [ ] **Step 4: El endpoint en `ScheduleController`**

```java
    public record BloqueDelDia(Long id, int blockNo, String grade, String subject,
                               String room, String startTime, String endTime,
                               int marcados, int estudiantes) {}

    public record MiDia(boolean lectivo, LocalDate fecha, String motivo,
                        List<BloqueDelDia> bloques) {}

    /**
     * El dia del docente: donde tiene clase y de que cursos ya paso lista.
     *
     * `fecha` es opcional y existe para poder probar esto sin depender del reloj del
     * servidor; sin ella se usa hoy.
     */
    @GetMapping("/my-day")
    public MiDia miDia(@RequestParam(required = false)
                       @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fecha) {
        LocalDate dia = fecha != null ? fecha : LocalDate.now(ZONA);
        if (!calendario.esDiaLectivo(dia)) {
            // No se devuelven bloques en un dia no lectivo: mostrarlos invitaria a
            // marcar la asistencia de una clase que no existe.
            return new MiDia(false, dia, calendario.motivo(dia), List.of());
        }
        var filas = horarios.myDay(jwt.currentUserId(), dia.getDayOfWeek().getValue(), dia);
        return new MiDia(true, dia, null, filas.stream()
                .map(f -> new BloqueDelDia(f.getId(), f.getBlockNo(), f.getGrade(),
                        f.getSubject(), f.getRoom(),
                        hhmm(f.getStartTime()), hhmm(f.getEndTime()),
                        f.getMarcados(), f.getEstudiantes()))
                .toList());
    }
```

`ZONA` (la zona horaria de Bogota) y el formateo `hhmm(...)` **ya existen en este
controlador** por la tarea del horario semanal: reutilizalos, no los redefinas. Para el
calendario usa los metodos que el servicio ya expone; **no cambies su firma**, esta tarea
no toca el calendario. Si no hay un metodo que devuelva el motivo, pasa `null` y anotalo
en el informe en vez de inventar uno.

- [ ] **Step 5: Ejecutar los tests del backend**

Run: `cd app/backend && mvn -q test`
Expected: PASS todo.

- [ ] **Step 6: Escribir los tests del frontend**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InicioDocente from './InicioDocente';

const DIA = {
  lectivo: true, fecha: '2026-08-03', motivo: null,
  bloques: [
    { id: 11, blockNo: 1, grade: '601', subject: 'Ciencias', room: 'Laboratorio 1',
      startTime: '07:00', endTime: '07:50', marcados: 38, estudiantes: 38 },
    { id: 12, blockNo: 3, grade: '702', subject: 'Ciencias', room: 'Aula 204',
      startTime: '09:00', endTime: '09:50', marcados: 0, estudiantes: 35 },
    { id: 13, blockNo: 5, grade: '801', subject: 'Ciencias', room: 'Aula 305',
      startTime: '11:00', endTime: '11:50', marcados: 3, estudiantes: 40 },
  ],
};

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const pintar = () => render(<MemoryRouter><InicioDocente /></MemoryRouter>);

describe('InicioDocente', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'DOCENTE',
      fullName: 'Pepito Perez', userId: 3, mustChangePassword: false,
    }));
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DIA)));
  });

  it('dice en que aula es cada clase', async () => {
    pintar();
    await waitFor(() => expect(screen.getByText(/Laboratorio 1/)).toBeInTheDocument());
    expect(screen.getByText(/Aula 204/)).toBeInTheDocument();
    expect(screen.getByText(/Aula 305/)).toBeInTheDocument();
  });

  it('distingue lo tomado, lo que va a medias y lo que falta', async () => {
    pintar();
    // Un si/no diria que el bloque de 3 de 40 ya esta tomado. No lo esta.
    await waitFor(() => expect(screen.getByText(/38 de 38/)).toBeInTheDocument());
    expect(screen.getByText(/3 de 40/)).toBeInTheDocument();
    expect(screen.getByText(/sin tomar/i)).toBeInTheDocument();
  });

  it('el bloque a medias tambien ofrece terminarlo, no solo el vacio', async () => {
    pintar();
    // 3 de 40 es el caso peligroso: parece hecho y no lo esta.
    const enlaces = await screen.findAllByRole('link', { name: /tomar la lista/i });
    const destinos = enlaces.map((e) => e.getAttribute('href'));
    expect(destinos).toContain('/asistencia?bloque=12');
    expect(destinos).toContain('/asistencia?bloque=13');
    expect(destinos).not.toContain('/asistencia?bloque=11');
  });

  it('en dia no lectivo lo dice y no inventa bloques', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(
      { lectivo: false, fecha: '2026-08-07', motivo: 'Batalla de Boyaca', bloques: [] })));
    pintar();
    // No se pintan ceros: no hay clase, y eso es lo que se dice.
    await waitFor(() => expect(screen.getByText(/no hay clase/i)).toBeInTheDocument());
    expect(screen.getByText(/Batalla de Boyaca/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tomar la lista/i })).not.toBeInTheDocument();
  });

  it('un docente sin bloques lo lee, no se queda con una pantalla muda', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(
      { lectivo: true, fecha: '2026-08-03', motivo: null, bloques: [] })));
    pintar();
    await waitFor(() =>
      expect(screen.getByText(/no tiene clases asignadas hoy/i)).toBeInTheDocument());
  });

  it('sin conexion lo dice en vez de fingir un dia sin clases', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));
    pintar();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
```

- [ ] **Step 7: Ejecutar y ver que fallan**

Run: `cd app/frontend && npm test src/pages/InicioDocente.test.tsx`
Expected: FAIL — el modulo no existe.

- [ ] **Step 8: Escribir `InicioDocente.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../api/client';

type Bloque = {
  id: number; blockNo: number; grade: string; subject: string; room?: string;
  startTime: string; endTime: string; marcados: number; estudiantes: number;
};
type Dia = { lectivo: boolean; fecha: string; motivo: string | null; bloques: Bloque[] };

/**
 * Lo tomado, lo que va a medias y lo que falta se dicen distinto a proposito.
 * El caso peligroso es el de en medio: parece hecho y no lo esta.
 */
function estado(b: Bloque) {
  if (b.marcados === 0) return { texto: 'sin tomar', clase: 'falta' };
  if (b.marcados < b.estudiantes) {
    return { texto: `${b.marcados} de ${b.estudiantes}`, clase: 'medias' };
  }
  return { texto: `${b.marcados} de ${b.estudiantes}`, clase: 'listo' };
}

export default function InicioDocente() {
  const [dia, setDia] = useState<Dia | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Dia>('/api/schedule/my-day')
       .then(setDia)
       .catch(() => setError('No se pudo consultar el dia. Requiere conexion.'));
  }, []);

  return (
    <main className="card ancha">
      <h1>Hola, {getSession()?.fullName}</h1>

      {error && <p role="alert" className="error">{error}</p>}
      {!dia && !error && <p className="meta">Cargando...</p>}

      {dia && !dia.lectivo && (
        <p className="aviso-no-lectivo">
          Hoy no hay clase{dia.motivo ? `: ${dia.motivo}` : ''}.
        </p>
      )}

      {dia?.lectivo && dia.bloques.length === 0 && (
        <p className="meta">
          No tiene clases asignadas hoy. Si cree que es un error, avise a coordinacion.
        </p>
      )}

      {dia?.lectivo && dia.bloques.length > 0 && (
        <ul className="dia-bloques">
          {dia.bloques.map((b) => {
            const e = estado(b);
            return (
              <li key={b.id} className={`bloque ${e.clase}`}>
                <span className="hora">{b.startTime}</span>
                <span className="donde">
                  <strong>{b.grade}</strong> {b.subject}
                  {b.room && <em className="aula"> en {b.room}</em>}
                </span>
                <span className="marcado">{e.texto}</span>
                {b.marcados < b.estudiantes && (
                  <Link to={`/asistencia?bloque=${b.id}`} className="tomar-lista">
                    Tomar la lista de {b.grade}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 9: Estilos**

```css
/* El dia del docente: una fila por bloque, legible de un vistazo en el telefono. */
.dia-bloques { list-style: none; padding: 0; margin: var(--e4) 0 0; display: grid; gap: 8px; }
.dia-bloques .bloque { display: grid; gap: 2px 12px; padding: 10px 12px;
                       border: 1px solid var(--rejilla); border-radius: 8px;
                       grid-template-columns: auto 1fr auto; align-items: baseline; }
.dia-bloques .hora { font-variant-numeric: tabular-nums; color: var(--tinta-suave); }
.dia-bloques .aula { color: var(--ocre); font-style: normal; font-weight: 700; }
.dia-bloques .marcado { font-size: .8rem; color: var(--tinta-suave); }
/* El estado se dice con palabras; el borde solo acompana, nunca informa por si solo. */
.dia-bloques .falta  { border-left: 4px solid var(--ocre); }
.dia-bloques .medias { border-left: 4px solid var(--ocre); }
.dia-bloques .listo  { border-left: 4px solid var(--verde); }
.dia-bloques .tomar-lista { grid-column: 1 / -1; margin-top: 4px; }
.aviso-no-lectivo { padding: 12px; border-radius: 8px; background: var(--fondo);
                    border: 1px dashed var(--rejilla); }
@media (max-width: 560px) {
  .dia-bloques .bloque { grid-template-columns: auto 1fr; }
  .dia-bloques .marcado { grid-column: 2; }
}
```

Si alguna de esas variables CSS no existe con ese nombre, usa la equivalente que ya use
el fichero; no anadas variables nuevas.

- [ ] **Step 10: Enrutarlo en `App.tsx`**

En el componente `Inicio`, el docente aterriza aqui:

```tsx
  if (session.role === 'ACUDIENTE') return <Padre />;
  if (session.role === 'DOCENTE') return <InicioDocente />;
  return <Home />;
```

con `import InicioDocente from './pages/InicioDocente';`. **No toques el reparto del
acudiente ni el del administrador**: cada uno se cambia en su propia tarea.

- [ ] **Step 11: Ejecutar todo**

Run: `cd app/frontend && npm test && npm run build`, y `cd app/backend && mvn -q test`
Expected: PASS todo.

- [ ] **Step 12: Comprobar que los tests pueden fallar**

Un test que no puede fallar da por cubierto lo que no lo esta. Rompe a proposito una cosa
de cada y confirma el rojo, luego restaura:
1. Cambia `b.marcados < b.estudiantes` por `b.marcados < 0` en el enlace: debe ponerse
   rojo el test del bloque a medias.
2. Quita `{b.room && ...}` de la vista: debe ponerse rojo el test del aula.

**Pega la evidencia de los dos rojos en el informe.** Sin ella la tarea no se cierra.

- [ ] **Step 13: Commit**

```bash
git add app/backend app/frontend
git commit -m "feat: el docente aterriza en su dia, con aula y lista pendiente

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: El acudiente ve los dias y el horario de cada hijo

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/GuardianController.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/repository/ReportRepository.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/guardian/PortalAcudienteTest.java`
- Modify: `app/frontend/src/pages/Padre.tsx`
- Test: `app/frontend/src/pages/Padre.test.tsx`
- Modify: `app/frontend/src/styles.css`

**Interfaces:**
- Consumes: `guardianships`, `attendance`, `students`, `schedule_blocks` con `room` (Task 1), `GET /api/schedule/week?grade=` (Task 2) **no se reutiliza**: el acudiente no es COORDINADOR y recibiria 403.
- Produces: `GET /api/guardian/children` ampliado, cada hijo con
  `{studentId, fullName, grade, schoolDays, recordedDays, asistio:int, falto:int, tarde:int, evadio:int, recent:[...], horario:[{weekday, blockNo, subject, room, startTime, endTime, teacherName}]}`

**Varios hijos por acudiente ya funciona y no hay que construirlo**: `guardianships` es
tabla de union con clave `(student_id, guardian_id)`, hay indice por `guardian_id` desde
`V30`, el endpoint ya devuelve una lista y `Padre.tsx` ya la recorre. Esta tarea **no
toca esa relacion**; solo anade datos a cada hijo. Lo que si hay que hacer es probarlo:
hoy no existe ningun test con un acudiente de dos hijos.

Lo que pidio la familia: **cuantos dias fue y cuantos no**, y **el horario del hijo**.

Cuidado con el resumen: `Padre.tsx` ya distingue "no hay registros" de "sin novedades",
y esa distincion es la parte mas importante del portal. Un padre lee "0 faltas" como "le
fue bien"; si nadie tomo asistencia, eso seria prometerle una tranquilidad que el sistema
no puede respaldar. **Los contadores nuevos no pueden romper esa distincion**: se muestran
sobre `recordedDays`, nunca sobre el total del periodo.

- [ ] **Step 1: Escribir el test del backend**

```java
package co.edu.ggm.asistencia.guardian;

import co.edu.ggm.asistencia.support.TestDatabaseConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestDatabaseConfig.class)
class PortalAcudienteTest {

    @Autowired MockMvc mvc;

    @Test
    void un_acudiente_con_dos_hijos_los_ve_a_los_dos() throws Exception {
        // La tabla `guardianships` siempre lo permitio, pero nunca se habia probado.
        String token = acudienteCon("Ana Perez", "601", "Luis Perez", "802");
        mvc.perform(get("/api/guardian/children").header("Authorization", token))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.length()").value(2))
           .andExpect(jsonPath("$[?(@.fullName=='Ana Perez')].grade").value("601"))
           .andExpect(jsonPath("$[?(@.fullName=='Luis Perez')].grade").value("802"));
    }

    @Test
    void cuenta_cuantos_dias_asistio_y_cuantos_falto() throws Exception {
        String token = acudienteCon("Ana Perez", "601");
        marcar("Ana Perez", "2026-08-03", "P");
        marcar("Ana Perez", "2026-08-04", "F");
        marcar("Ana Perez", "2026-08-05", "T");
        mvc.perform(get("/api/guardian/children").header("Authorization", token))
           .andExpect(jsonPath("$[0].asistio").value(1))
           .andExpect(jsonPath("$[0].falto").value(1))
           .andExpect(jsonPath("$[0].tarde").value(1))
           .andExpect(jsonPath("$[0].recordedDays").value(3));
    }

    @Test
    void sin_ningun_registro_los_contadores_van_en_cero_y_recordedDays_tambien() throws Exception {
        // Es el caso que no se puede confundir con "asistio siempre".
        String token = acudienteCon("Ana Perez", "601");
        mvc.perform(get("/api/guardian/children").header("Authorization", token))
           .andExpect(jsonPath("$[0].recordedDays").value(0))
           .andExpect(jsonPath("$[0].asistio").value(0))
           .andExpect(jsonPath("$[0].falto").value(0));
    }

    @Test
    void devuelve_el_horario_del_hijo_con_el_aula() throws Exception {
        String token = acudienteCon("Ana Perez", "601");
        horarioDe("601", 1, 1, "Ciencias", "Laboratorio 1", "Pepito Perez");
        mvc.perform(get("/api/guardian/children").header("Authorization", token))
           .andExpect(jsonPath("$[0].horario[0].subject").value("Ciencias"))
           .andExpect(jsonPath("$[0].horario[0].room").value("Laboratorio 1"))
           .andExpect(jsonPath("$[0].horario[0].teacherName").value("Pepito Perez"))
           .andExpect(jsonPath("$[0].horario[0].weekday").value(1));
    }

    @Test
    void un_acudiente_no_ve_hijos_ajenos() throws Exception {
        String token = acudienteCon("Ana Perez", "601");
        estudianteSuelto("Hijo De Otro", "601");
        mvc.perform(get("/api/guardian/children").header("Authorization", token))
           .andExpect(jsonPath("$.length()").value(1))
           .andExpect(jsonPath("$[0].fullName").value("Ana Perez"));
    }

    @Test
    void el_personal_no_entra_por_esta_puerta() throws Exception {
        mvc.perform(get("/api/guardian/children").header("Authorization", tokenDeDocente()))
           .andExpect(status().isForbidden());
    }
}
```

Para la siembra (`acudienteCon`, `marcar`, `horarioDe`, `estudianteSuelto`,
`tokenDeDocente`) **sigue la via que ya usan los tests existentes** del proyecto; mira
como lo hacen antes de escribir nada. No inventes un mecanismo nuevo.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/backend && mvn -q test -Dtest=PortalAcudienteTest`
Expected: FAIL — faltan los campos nuevos; el primero y el ultimo pueden pasar ya, y esta
bien: prueban lo que ya funcionaba y quedan como red.

- [ ] **Step 3: Ampliar el `record Child` y la consulta**

En `GuardianController`, el record crece:

```java
    public record BloqueHorario(int weekday, int blockNo, String subject, String room,
                                String startTime, String endTime, String teacherName) {}

    public record Child(Long studentId, String fullName, String grade,
                        int schoolDays, int recordedDays,
                        int asistio, int falto, int tarde, int evadio,
                        List<Mark> recent, List<BloqueHorario> horario) {}
```

Los contadores salen de una sola consulta agrupada, no de contar en Java sobre `recent`:
`recent` esta limitada a las ultimas novedades y contar sobre ella daria numeros
equivocados en cuanto el periodo pase de ese limite.

```java
    /** Cuantos dias asistio, falto, llego tarde o evadio, por estudiante. */
    @Query(value = """
            SELECT a.student_id AS studentId,
                   count(*) FILTER (WHERE a.status = 'P') AS asistio,
                   count(*) FILTER (WHERE a.status = 'F') AS falto,
                   count(*) FILTER (WHERE a.status = 'T') AS tarde,
                   count(*) FILTER (WHERE a.status = 'E') AS evadio,
                   count(DISTINCT a.class_date)            AS diasRegistrados
              FROM attendance a
             WHERE a.student_id IN (:ids)
             GROUP BY a.student_id
            """, nativeQuery = true)
    List<ConteoRow> conteosPorEstudiante(@Param("ids") List<Long> ids);

    interface ConteoRow {
        Long getStudentId(); int getAsistio(); int getFalto();
        int getTarde(); int getEvadio(); int getDiasRegistrados();
    }
```

**Una sola consulta para todos los hijos**, no una por hijo: un acudiente con tres hijos
no debe costar tres viajes a la base. Si `ids` viene vacia, no llames a la consulta —
`IN ()` es un error de sintaxis en PostgreSQL.

Para el horario, reutiliza `ScheduleRepository.weekOfGrade(...)` que **ya existe** de la
Task 2. No dupliques la consulta y **no** llames al endpoint HTTP `/api/schedule/week`:
el acudiente no tiene el rol que ese endpoint exige y recibiria 403.

- [ ] **Step 4: Ejecutar los tests del backend**

Run: `cd app/backend && mvn -q test`
Expected: PASS todo.

- [ ] **Step 5: Escribir los tests del frontend**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Padre from './Padre';

const DOS_HIJOS = [
  { studentId: 1, fullName: 'Ana Perez', grade: '601',
    schoolDays: 10, recordedDays: 8, asistio: 6, falto: 1, tarde: 1, evadio: 0,
    recent: [{ classDate: '2026-08-04', subject: 'Ciencias', status: 'F' }],
    horario: [{ weekday: 1, blockNo: 1, subject: 'Ciencias', room: 'Laboratorio 1',
                startTime: '07:00', endTime: '07:50', teacherName: 'Pepito Perez' }] },
  { studentId: 2, fullName: 'Luis Perez', grade: '802',
    schoolDays: 10, recordedDays: 0, asistio: 0, falto: 0, tarde: 0, evadio: 0,
    recent: [], horario: [] },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Padre', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ACUDIENTE',
      fullName: 'Madre Perez', userId: 9, mustChangePassword: false,
    }));
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DOS_HIJOS)));
  });

  it('muestra a los dos hijos, cada uno con su curso', async () => {
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/Ana Perez/)).toBeInTheDocument());
    expect(screen.getByText(/Luis Perez/)).toBeInTheDocument();
    expect(screen.getByText(/601/)).toBeInTheDocument();
    expect(screen.getByText(/802/)).toBeInTheDocument();
  });

  it('dice cuantos dias asistio y cuantos falto', async () => {
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/6 .*asisti/i)).toBeInTheDocument());
    expect(screen.getByText(/1 .*falt/i)).toBeInTheDocument();
  });

  it('sin registros no dice que asistio siempre', async () => {
    render(<Padre />);
    // Luis no tiene un solo registro. Decir "0 faltas" seria prometer una tranquilidad
    // que el sistema no puede respaldar: nadie ha tomado su asistencia.
    await waitFor(() => expect(screen.getByText(/Luis Perez/)).toBeInTheDocument());
    const seccion = screen.getByText(/Luis Perez/).closest('section')!;
    expect(seccion).toHaveTextContent(/todavia no hay registros/i);
    expect(seccion).not.toHaveTextContent(/sin novedades/i);
    expect(seccion).not.toHaveTextContent(/asistio a las/i);
  });

  it('muestra el horario del hijo con el aula y el docente', async () => {
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/Ana Perez/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /horario de Ana Perez/i }));
    expect(screen.getByText(/Laboratorio 1/)).toBeInTheDocument();
    expect(screen.getByText(/Pepito Perez/)).toBeInTheDocument();
    expect(screen.getByText(/lunes/i)).toBeInTheDocument();
  });

  it('un hijo sin horario cargado lo dice', async () => {
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/Luis Perez/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /horario de Luis Perez/i }));
    expect(screen.getByText(/no tiene horario cargado/i)).toBeInTheDocument();
  });

  it('sin conexion lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));
    render(<Padre />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
```

- [ ] **Step 6: Ejecutar y ver que fallan**

Run: `cd app/frontend && npm test src/pages/Padre.test.tsx`
Expected: FAIL en los de contadores y horario; los de dos hijos y sin conexion pueden
pasar ya.

- [ ] **Step 7: Ampliar `Padre.tsx`**

Sobre lo que ya existe, sin rehacerlo:

1. El tipo `Child` gana `asistio`, `falto`, `tarde`, `evadio` y `horario`.
2. Bajo el resumen que ya se calcula, se anaden los contadores **solo si
   `recordedDays > 0`**. Con cero registros no se pinta ningun contador: se deja el
   mensaje que ya dice que todavia no hay registros.

```tsx
{h.recordedDays > 0 && (
  <ul className="conteo-hijo">
    <li><strong>{h.asistio}</strong> dias asistio</li>
    <li><strong>{h.falto}</strong> dias falto</li>
    {h.tarde > 0 && <li><strong>{h.tarde}</strong> dias llego tarde</li>}
    {h.evadio > 0 && <li><strong>{h.evadio}</strong> dias evadio clase</li>}
  </ul>
)}
```

3. El horario va detras de un boton por hijo, porque un acudiente con tres hijos no
   necesita tres rejillas abiertas a la vez en el telefono:

```tsx
const [abierto, setAbierto] = useState<number | null>(null);

// ... dentro del map de hijos:
<button type="button" className="secundario"
        aria-expanded={abierto === h.studentId}
        onClick={() => setAbierto(abierto === h.studentId ? null : h.studentId)}>
  Horario de {h.fullName}
</button>
{abierto === h.studentId && (
  h.horario.length === 0
    ? <p className="meta">Este curso no tiene horario cargado todavia.</p>
    : <ul className="horario-hijo">
        {h.horario.map((b, i) => (
          <li key={i}>
            <strong>{DIAS[b.weekday]}</strong> {b.startTime} — {b.subject}
            {b.room && <em className="aula"> en {b.room}</em>}
            {b.teacherName && <span className="meta"> con {b.teacherName}</span>}
          </li>
        ))}
      </ul>
)}
```

con `const DIAS = ['', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes'];`.

- [ ] **Step 8: Estilos**

```css
/* Portal del acudiente: los conteos y el horario de cada hijo. */
.conteo-hijo { list-style: none; padding: 0; margin: 4px 0 0; display: flex;
               flex-wrap: wrap; gap: 4px 16px; font-size: .85rem; }
.horario-hijo { list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 4px;
                font-size: .85rem; }
.horario-hijo li { padding: 6px 8px; border-left: 3px solid var(--rejilla); }
```

- [ ] **Step 9: Ejecutar todo**

Run: `cd app/frontend && npm test && npm run build`, y `cd app/backend && mvn -q test`
Expected: PASS todo.

- [ ] **Step 10: Comprobar que los tests pueden fallar**

Rompe a proposito y confirma el rojo, luego restaura:
1. Quita el `h.recordedDays > 0 &&` que envuelve los contadores: debe ponerse rojo el
   test de "sin registros no dice que asistio siempre". **Este es el que importa**: es la
   promesa que el portal no puede romper.
2. Quita `{b.room && ...}` del horario: debe ponerse rojo el test del aula.

**Pega la evidencia de los dos rojos en el informe.** Sin ella la tarea no se cierra.

- [ ] **Step 11: Commit**

```bash
git add app/backend app/frontend
git commit -m "feat: el acudiente ve los dias y el horario de cada hijo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Poblar la base local para poder ver algo

**Files:**
- Create: `tools/datos-locales.sql`
- Modify: `app/README.md`

**Interfaces:**
- Consumes: el esquema completo, ya migrado por Flyway.
- Produces: la base `asistencia` con datos suficientes para evaluar las vistas nuevas.

Hoy la base de desarrollo tiene **3 estudiantes, 1 bloque de horario y 6 registros de
asistencia**. Con eso el calendario se ve vacío, el horario tiene una casilla y el
tablero muestra ceros. **No es posible juzgar ninguna pantalla.**

Se siembra un colegio pequeño pero completo: **6 cursos de 30 estudiantes, 12 docentes,
horario de 5 días con 6 bloques y aula, y el mes en curso de asistencia**. Es
deliberadamente más chico que `tools/datos-de-carga.sql` (que sirve para medir
rendimiento con 620.000 registros): aquí lo que se busca es **ver**, y una base que
tarda cinco minutos en sembrarse estorba.

- [ ] **Step 1: Escribir `tools/datos-locales.sql`**

```sql
-- Datos de desarrollo: un colegio pequeno pero completo, para poder ver las pantallas.
-- Para medir rendimiento esta tools/datos-de-carga.sql, que siembra 620.000 registros.
--
--   psql -U postgres -d asistencia -f tools/datos-locales.sql
--
-- Es idempotente: se puede volver a ejecutar sin duplicar nada.

\timing on

-- 12 docentes -----------------------------------------------------------------
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT 'profe' || n || '@ggm.edu.co',
       '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       (ARRAY['Ana','Luis','Marta','Carlos','Sofia','Jorge',
              'Elena','Miguel','Paula','Andres','Clara','Diego'])[n]
       || ' ' ||
       (ARRAY['Rojas','Medina','Cardenas','Pineda','Vargas','Salazar',
              'Duarte','Ochoa','Beltran','Quintero','Nieto','Moreno'])[n],
       'DOCENTE', TRUE, FALSE
FROM generate_series(1, 12) AS n
ON CONFLICT (email) DO NOTHING;

-- 6 materias ------------------------------------------------------------------
INSERT INTO subjects (name) VALUES
  ('Matematicas'), ('Espanol'), ('Ciencias'), ('Sociales'), ('Ingles'), ('Informatica')
ON CONFLICT (name) DO NOTHING;

-- 180 estudiantes en 6 cursos (601 a 606, 30 por curso) ------------------------
INSERT INTO students (document_id, first_name, middle_name, last_name, second_surname,
                      grade, active)
SELECT lpad((1100000000 + n)::text, 10, '0'),
       (ARRAY['Camila','Santiago','Valentina','Mateo','Isabella','Sebastian',
              'Salome','Emiliano','Antonia','Tomas'])[1 + (n % 10)],
       (ARRAY['Andrea','Jose','Lucia','David','Sofia','Alejandro',
              'Marcela','Nicolas','Daniela','Felipe'])[1 + ((n * 3) % 10)],
       (ARRAY['Gonzalez','Ramirez','Herrera','Castro','Molina','Reyes',
              'Acosta','Peralta','Suarez','Mendoza'])[1 + ((n * 7) % 10)],
       (ARRAY['Lopez','Torres','Rivas','Guzman','Pardo','Cordoba',
              'Silva','Naranjo','Bonilla','Escobar'])[1 + ((n * 11) % 10)],
       (600 + 1 + ((n - 1) / 30))::text,
       TRUE
FROM generate_series(1, 180) AS n
ON CONFLICT (document_id) DO NOTHING;

-- Horario: 6 cursos x 5 dias x 6 bloques, con aula --------------------------------
-- El aula sigue la convencion del colegio: piso + numero. 601 esta en el aula 201.
INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                             subject_id, teacher_id, room)
SELECT g.grade,
       d.weekday,
       b.block_no,
       (TIME '06:30' + (b.block_no - 1) * INTERVAL '55 minutes'),
       (TIME '07:20' + (b.block_no - 1) * INTERVAL '55 minutes'),
       (SELECT id FROM subjects ORDER BY id
         LIMIT 1 OFFSET ((b.block_no - 1 + d.weekday) % 6)),
       (SELECT id FROM users WHERE email LIKE 'profe%' ORDER BY id
         LIMIT 1 OFFSET ((abs(hashtext(g.grade)) + b.block_no + d.weekday) % 12)),
       CASE WHEN (b.block_no + d.weekday) % 7 = 0 THEN 'Laboratorio'
            WHEN (b.block_no + d.weekday) % 5 = 0 THEN 'Sala de sistemas'
            ELSE 'Aula ' || (200 + (g.grade::int - 600)) END
FROM (SELECT DISTINCT grade FROM students WHERE grade LIKE '6%') g
CROSS JOIN generate_series(1, 5) AS d(weekday)
CROSS JOIN generate_series(1, 6) AS b(block_no)
ON CONFLICT (grade, weekday, block_no) DO UPDATE
  SET room = EXCLUDED.room, teacher_id = EXCLUDED.teacher_id;

-- Asistencia del mes en curso -----------------------------------------------------
-- Distribucion parecida a la real: ~92 % presentes, y el resto repartido.
INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status,
                        recorded_by, recorded_at)
SELECT gen_random_uuid(), s.id, b.id, c.calendar_date,
       CASE WHEN random() < 0.92 THEN 'P'
            WHEN random() < 0.50 THEN 'T'
            WHEN random() < 0.75 THEN 'F'
            ELSE 'E' END,
       b.teacher_id,
       c.calendar_date + TIME '07:00'
FROM students s
JOIN schedule_blocks b ON b.grade = s.grade
JOIN school_calendar c ON c.day_type = 'LECTIVO'
                      AND EXTRACT(ISODOW FROM c.calendar_date) = b.weekday
                      AND c.calendar_date >= date_trunc('month', CURRENT_DATE)::date
                      AND c.calendar_date < CURRENT_DATE
WHERE s.grade LIKE '6%'
ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING;

-- Acudientes: uno por estudiante ---------------------------------------------------
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT 'acudiente.' || s.document_id || '@correo.com',
       '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       'Acudiente de ' || s.first_name || ' ' || s.last_name,
       'ACUDIENTE', TRUE, FALSE
FROM students s WHERE s.grade LIKE '6%'
ON CONFLICT (email) DO NOTHING;

INSERT INTO guardianships (student_id, guardian_id, relationship)
SELECT s.id, u.id, 'Madre'
FROM students s
JOIN users u ON u.email = 'acudiente.' || s.document_id || '@correo.com'
ON CONFLICT (student_id, guardian_id) DO NOTHING;

ANALYZE;

SELECT 'estudiantes' AS tabla, count(*) FROM students WHERE grade LIKE '6%'
UNION ALL SELECT 'docentes',    count(*) FROM users WHERE email LIKE 'profe%'
UNION ALL SELECT 'bloques',     count(*) FROM schedule_blocks
UNION ALL SELECT 'asistencias', count(*) FROM attendance
UNION ALL SELECT 'acudientes',  count(*) FROM users WHERE role = 'ACUDIENTE';
```

**Este script depende de la columna `room`, que crea la Task 1.** Ejecutarlo antes
fallará con "column room does not exist"; ese es el orden correcto y está anotado en el
Step 3.

- [ ] **Step 2: Documentarlo en `app/README.md`**

Añadir tras la sección de puesta en marcha:

```markdown
## Datos para desarrollo

La base recién migrada trae solo tres estudiantes de ejemplo, con los que ninguna
pantalla se puede evaluar. Para sembrar un colegio pequeño pero completo —6 cursos de
30 estudiantes, 12 docentes, horario de la semana con aulas y el mes en curso de
asistencia—:

```bash
psql -U postgres -d asistencia -f tools/datos-locales.sql
```

Tarda unos segundos y se puede repetir sin duplicar nada. Todos los usuarios sembrados
entran con `cambiar123`.

Para **medir rendimiento** con el volumen real del colegio (1.200 estudiantes y 620.000
registros) está `tools/datos-de-carga.sql`, que va sobre una base aparte.
```

- [ ] **Step 3: Ejecutarlo, después de la Task 1**

Run:
```bash
cd app/backend && DB_URL=jdbc:postgresql://localhost:5432/asistencia \
  DB_USER=postgres DB_PASSWORD=postgres mvn spring-boot:run   # aplica V50
# en otra terminal, una vez arrancado:
psql -U postgres -d asistencia -f tools/datos-locales.sql
```
Expected: 180 estudiantes, 12 docentes, 180 bloques y varios miles de asistencias.

- [ ] **Step 4: Commit de los datos**

```bash
git add tools/datos-locales.sql app/README.md
git commit -m "chore: datos de siembra para la base local

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Recorrer las pantallas con datos de verdad**

Este es el paso que pidió el colegio: *"poblar la base local con fines de testear como
se ve"*. Ahora sí hay calendario, horarios y aulas que mirar. Se levantan backend y
frontend y se recorre **todo**, anotando lo que no cuadre:

Como docente (`profe1@ggm.edu.co`):
1. `/horario` muestra su semana con curso, materia y **aula**, y la columna de hoy resaltada.
2. Pulsar "Tomar la lista de 6xx" abre `/asistencia` **con el curso y el bloque ya elegidos**
   y la lista cargada.
3. `/calendario` pinta el mes con los festivos **con la palabra**, no solo en color.
4. A 360 px de ancho ni la rejilla del horario ni la del calendario desbordan la página.

Como coordinación:
5. En `/horario`, escribir `601` muestra ese curso **con el nombre del docente** y sin
   enlaces para marcar.
6. En `/calendario` sí aparecen los desplegables para cambiar el tipo de día.
7. Cambiar un día a "suspendido" y comprobar que en `/asistencia` ese día ya no deja marcar.

Como administrador:
8. Al entrar aterriza en el tablero de hoy, con el mes de contexto.
9. El primer dato es **cuántos bloques han reportado de cuántos**, no un porcentaje suelto.
10. Si hoy no es día lectivo, la pantalla lo dice — no pinta ceros.
11. La barra lateral lleva a los siete destinos y en el teléfono se abre como cajón.

**Lo que se encuentre roto aquí se arregla aquí**, no se apunta para después: es la
primera vez que estas pantallas ven datos de verdad y es donde van a aparecer los fallos
que los tests no cubren.

- [ ] **Step 6: Ejecutar la batería completa**

Run: `cd app/backend && mvn -q test` y `cd app/frontend && npm test && npm run build`
Expected: PASS todo.

Luego `bash tools/humo.sh` contra la aplicación levantada, para que las invariantes de
siempre no se hayan roto por el camino.

- [ ] **Step 7: Commit de los arreglos del recorrido**

```bash
git add -A
git commit -m "fix: lo que aparecio al recorrer las pantallas con datos reales

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fuera de alcance

Lo que **no** se hace, con su motivo. Vale tanto como lo que sí:

1. **Editar el horario desde la interfaz.** Una rejilla de horario editable, con
   validación de choques de aula y de docente, es una pantalla entera y un problema de
   asignación. El CSV cubre la carga inicial y las correcciones puntuales.
2. **Detectar choques de aula o de docente.** Dos bloques en la misma aula a la misma
   hora es un error real, pero avisarlo requiere decidir qué hacer con el horario que ya
   está cargado. Merece su propio plan, después de ver el horario real del colegio.
3. **Una tabla de aulas** con capacidad y tipo. Hoy solo se necesita mostrar el nombre.
4. **Días institucionales A/B.** Sigue pendiente de que el colegio defina el modelo. El
   horario semanal por día de la semana es compatible con esa evolución.
5. **Calendario del año completo en una pantalla.** Doce cuadrículas no se leen; el mes
   con navegación resuelve la pregunta real, que es "¿esta semana hay clase?".
6. **Que el acudiente vea el horario de su hijo.** Es razonable y no lo pidió el colegio;
   se añade cuando lo pidan, reutilizando `weekOfGrade`.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `countBlocksReported` hace dos subconsultas por bloque | El resumen de hoy podría tardar | Son ~36 bloques al día y los índices ya existen; si pasara de 300 ms, medir antes de optimizar |
| La barra lateral rompe tests de `Home` que buscaban sus enlaces | Falsos rojos | Está anotado en la Task 5 Step 8: se borran esas comprobaciones porque el comportamiento se movió a `Menu`, donde ya está probado |
| El calendario en 390 px oculta las etiquetas escritas | Se dependería del color | El `aria-label` conserva la etiqueta y el mes navegable permite tocar cada día |
| `datos-locales.sql` se ejecuta antes de `V50` | Falla con "column room does not exist" | Es el orden correcto y está dicho en la Task 9 Step 3 |
| Preseleccionar el bloque por URL con una copia local desactualizada | El bloque no se encuentra | No se hace nada y el docente elige a mano; está en la Task 4 Step 4 |

## Self-review

**Cobertura de lo pedido.** Cada cosa que pidió el colegio tiene tarea:

| Pedido | Tarea |
|---|---|
| El escudo real en la aplicación | Hecho antes de este plan (`components/Escudo.tsx`) |
| Barra lateral con el resto de sitios | Task 5 |
| Que el administrador entre a un tablero del día y del mes | Task 6 |
| Calendario que diga qué días hay clase, con festivos | Task 3 (sobre `school_calendar`, que ya existía) |
| Horario semanal por curso | Tasks 3 y 5 |
| Que el docente sepa **dónde** tiene clase | Task 1 (columna `room`) y Task 4 |
| Tener su horario en el celular | Task 4, rejilla desplazable y bloque de hoy resaltado |
| "Voy a tomar la lista de tal curso" | Task 4 Steps 3 y 4 |
| Poblar la base local para ver cómo queda | Task 7 |

**Sin marcadores de posición.** Cada paso trae el código o el comando exacto. La única
instrucción de borrado —la línea muerta de `TodayService`— está señalada explícitamente
en su propio paso.

**Consistencia de nombres.** `room` es el mismo campo en la migración, la entidad,
`BlockDto`, `WeekBlock`, el CSV y `contract.ts`. `WeekRow` se declara en la Task 2
Step 3 y se consume en el Step 4. `ResumenDeHoy` tiene los mismos campos en el servicio,
el endpoint y el tipo del frontend. `Layout` y `Menu` se declaran en la Task 5 y se usan
en `App.tsx` en esa misma tarea.

**Lo que este plan hereda del proyecto.** Dos reglas que ya costaron caro y que aquí se
aplican desde el principio: **ningún test depende de qué día es hoy** —por eso `HoyTest`
prueba el servicio con una fecha fija—, y **una pantalla nunca resume la ausencia de
datos como si fuera un dato** —por eso el día no lectivo dice "hoy no hay clase" en vez
de mostrar ceros, y el horario vacío dice que no hay bloques asignados en vez de pintar
una rejilla en blanco.
