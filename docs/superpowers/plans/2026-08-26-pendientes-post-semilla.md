# Pendientes tras la semilla del colegio completo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la deuda que dejó la sesión del 26 de agosto de 2026: código sin commitear, endpoints y pantallas nuevas sin pruebas, semillas obsoletas que ya nadie debe ejecutar, y datos de demostración incompletos (portería vacía, un solo mes, un solo grupo por grado).

**Architecture:** No hay arquitectura nueva. Cada tarea toca una capa existente: pruebas de integración con MockMvc en el backend (`AbstractIntegrationTest` + `tokenDe`), pruebas de componente con Vitest + Testing Library en el frontend, y SQL idempotente en `tools/`. El orden es: primero fijar en commits lo que ya funciona, luego cubrirlo con pruebas, luego limpiar lo obsoleto, y al final ampliar los datos de demostración.

**Tech Stack:** Spring Boot 3.4 + Flyway + PostgreSQL 16 (backend), React 18 + Vite + Vitest + Dexie (frontend), Maven, psql.

**Spec:** No hay spec escrita: este plan sale del inventario del repositorio hecho el 2026-08-26 (git status, grep de `ponytail:`, comparación de endpoints contra clases de test). Cada tarea nombra la evidencia que la justifica.

## Global Constraints

- **Comentarios y textos en español sin tildes** en código y SQL (convención del repositorio; las tildes solo aparecen en textos de interfaz ya existentes).
- **Base de datos local:** `psql -U postgres -d asistencia`; contraseña `postgres` vía `PGPASSWORD`. En Windows el binario está en `C:\Program Files\PostgreSQL\16\bin\psql.exe`.
- **Backend en local:** `cd app/backend && DB_USER=postgres DB_PASSWORD=postgres mvn spring-boot:run`. Sin esas variables falla con `FATAL: la autentificación password falló para el usuario «asistencia»`.
- **Tests backend:** `cd app/backend && mvn -o test` — requiere la base `asistencia_test` creada. Línea base actual: **175 pruebas en verde**.
- **Tests frontend:** `cd app/frontend && npx vitest run`. Línea base actual: **174 pruebas en verde**.
- **Tras cualquier cambio de frontend que se quiera ver en `localhost:8080`:** `bash tools/refrescar-web.sh` y recarga forzada (Ctrl+Shift+R) por el service worker. Si `target/classes/static` está bloqueado porque el backend corre, borra solo `target/classes/static/assets` y copia encima.
- **Nunca borrar `tools/datos-de-carga.sql`** (siembra de 620.000 registros para pruebas de rendimiento) ni las migraciones Flyway `V1..V62`: la semilla `V3__datos_semilla.sql` es la fixture de las pruebas del backend.
- **Formato de curso:** `<numero><letra>` (`0A`, `10B`), el que ordena `orden_curso()` y `ordenCurso.ts`.

---

## File Structure

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| (varios, ya modificados) | trabajo sin commitear de la sesión anterior | 1 |
| `app/backend/src/test/java/co/edu/ggm/asistencia/attendance/RecientesTest.java` | **crear** — cubre `/api/attendance/recientes` y su filtro por rol | 2 |
| `app/backend/src/test/java/co/edu/ggm/asistencia/report/HoyTest.java` | **modificar** — cubre `mesPorDia` de `/api/reports/today` | 3 |
| `app/frontend/src/pages/RegistroClase.test.tsx` | **crear** — cubre la pantalla de CRUD por curso | 4 |
| `app/frontend/src/pages/TomarAsistencia.test.tsx` | **modificar** — cubre el panel lateral de últimos llamados | 5 |
| `tools/datos-locales.sql`, `tools/datos-realistas.sql` | **borrar** — reemplazadas por `datos-colegio.sql` | 6 |
| `README.md` | **modificar** — documentar la semilla vigente y los usuarios | 6 |
| `tools/datos-colegio.sql` | **modificar** — portería, dos meses de historia, acudiente con dos hijos | 7 |
| `app/backend/.../config/SpaConfig.java` + su test | **modificar** — quitar el tope arbitrario de 3 segmentos | 8 |
| `app/frontend/src/components/charts/LineasNovedades.tsx` + test nuevo | **modificar/crear** — alternativa en tabla, como el resto de gráficas | 9 |

---

### Task 1: Fijar en commits el trabajo de la sesión

Hay once ficheros modificados y dos sin rastrear (uno es este plan), todos funcionando y con pruebas en verde, pero sin commitear. Un fallo de disco o un `git checkout` los pierde. Parte del backend (`TodayService`, `ReportRepository`, `AttendanceController`) ya entro en el commit `b45ae08`; lo que queda es lo de abajo.

**Files:**
- Modify: ninguno (solo `git`)

**Interfaces:**
- Consumes: nada.
- Produces: un árbol de trabajo limpio, para que las tareas siguientes tengan diffs legibles.

- [ ] **Step 1: Ver exactamente qué hay pendiente**

```bash
cd /c/Users/Julian/Downloads/sistema-control-asistencia
git status --short
git diff --stat
```

Esperado: `SpaConfig.java`, `SpaRoutingTest.java`, `App.tsx`, `LineasNovedades.tsx`, `Horario.tsx`, `Horario.test.tsx`, `InicioAdmin.tsx`, `InicioAdmin.test.tsx`, `TomarAsistencia.tsx`, `styles.css`, `tools/datos-colegio.sql` modificados; `RegistroClase.tsx` y este plan sin rastrear.

- [ ] **Step 2: Confirmar que todo está en verde antes de commitear**

```bash
cd app/frontend && npx vitest run
cd ../backend && mvn -o test
```

Esperado: 174 pruebas de frontend y 175 de backend, todas pasando. Si algo falla, **para y arréglalo**: no se commitea rojo.

- [ ] **Step 3: Commit de la semilla del colegio**

```bash
cd /c/Users/Julian/Downloads/sistema-control-asistencia
git add tools/datos-colegio.sql
git commit -m "Sembrar colegio completo de grado 0 a 11 con horario de 7:00 a 1:30

Doce cursos 0A..11A con 25 estudiantes, 12 docentes (uno por materia, sin
choques de horario), 360 bloques y la asistencia del mes. Los nombres se
indexan por la posicion del estudiante en el curso para que no se repita
un nombre completo dentro del mismo curso.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Commit del enrutado de varios segmentos**

```bash
git add app/backend/src/main/java/co/edu/ggm/asistencia/config/SpaConfig.java \
        app/backend/src/test/java/co/edu/ggm/asistencia/config/SpaRoutingTest.java
git commit -m "Reenviar al index las rutas de la SPA con varios segmentos

Recargar /asistencia/:blockId/:fecha devolvia el 404 del manejador de
estaticos: el patron solo cubria un segmento.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Commit de la pantalla de registro por curso**

```bash
git add app/frontend/src/pages/RegistroClase.tsx app/frontend/src/App.tsx \
        app/frontend/src/pages/TomarAsistencia.tsx
git commit -m "Abrir cada llamado de lista en su propia URL con CRUD por curso

El panel lateral de /asistencia pasa a ser enlaces a
/asistencia/:blockId/:fecha, una pantalla propia con los estudiantes del
curso, su estado, quien tomo la lista y editar/borrar por estudiante.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Commit de la grafica y el resumen del inicio**

```bash
git add app/frontend/src/components/charts/LineasNovedades.tsx \
        app/frontend/src/pages/InicioAdmin.tsx \
        app/frontend/src/pages/InicioAdmin.test.tsx \
        app/frontend/src/styles.css \
        app/backend/src/main/java/co/edu/ggm/asistencia/service/TodayService.java \
        app/backend/src/main/java/co/edu/ggm/asistencia/repository/ReportRepository.java
git commit -m "Anadir grafica de novedades por dia y resumen en prosa al inicio

Tres series (faltas por estudiante, evasiones, llegadas tarde) sobre una
escala comun, alimentadas por mesPorDia en /api/reports/today.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Commit del horario por cursos**

```bash
git add app/frontend/src/pages/Horario.tsx app/frontend/src/pages/Horario.test.tsx
git commit -m "Navegar el horario por curso y no por salon

Con un aula fija por curso la lista de salones era la misma lista dos
veces. Se quita la seccion y el filtro ?room=.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Commit del plan y verificacion**

```bash
git add docs/superpowers/plans/2026-08-26-pendientes-post-semilla.md
git commit -m "Anadir el plan de pendientes tras la semilla del colegio

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git status --short
```

Esperado: salida vacía.

---

### Task 2: Prueba de `/api/attendance/recientes`

El endpoint que alimenta el panel lateral de `/asistencia` no tiene ninguna prueba. Su regla no es obvia y es de privacidad: un docente solo ve los bloques que dicta; coordinación y administración ven los de todos. Si alguien invierte esa condición, un docente pasa a ver los cursos de sus colegas y nada falla.

**Files:**
- Create: `app/backend/src/test/java/co/edu/ggm/asistencia/attendance/RecientesTest.java`
- Reference: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/AttendanceController.java:139-148`
- Reference (patrón a copiar): `app/backend/src/test/java/co/edu/ggm/asistencia/attendance/CrudAsistenciaTest.java`

**Interfaces:**
- Consumes: `AbstractIntegrationTest.tokenDe(String email, String rol)` y `AbstractIntegrationTest.jdbcBase` (un `JdbcTemplate`).
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Escribir la prueba que falla**

Crea `app/backend/src/test/java/co/edu/ggm/asistencia/attendance/RecientesTest.java` con exactamente esto. Usa el curso `RCA` y documentos `RCA...` para no chocar con la semilla ni con `CrudAsistenciaTest`:

```java
package co.edu.ggm.asistencia.attendance;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Ultimas tomas de lista para el panel lateral de /asistencia. La regla que se
 * protege aqui es de privacidad: un docente ve solo lo suyo, coordinacion ve todo.
 * Usa su propio curso ("RCA") para no chocar con la semilla ni con otras clases.
 */
@AutoConfigureMockMvc
class RecientesTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private static final String GRADE = "RCA";
    private static final String FECHA = "2026-04-27";   // lunes lectivo, libre de otras clases

    private Long bloquePropio;
    private Long bloqueAjeno;
    private Long estudianteId;

    private Long crearDocente(String email, String nombre) {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES (?, 'x', ?, 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """, email, nombre);
        return jdbcBase.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, email);
    }

    private Long crearBloque(int blockNo, Long teacherId) {
        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('Materia RCA') ON CONFLICT (name) DO NOTHING");
        int weekday = LocalDate.parse(FECHA).getDayOfWeek().getValue();
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id)
                VALUES (?, ?, ?, '07:00', '07:50',
                        (SELECT id FROM subjects WHERE name = 'Materia RCA'), ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                """, GRADE, weekday, blockNo, teacherId);
        return jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade = ? AND weekday = ? AND block_no = ?",
                Long.class, GRADE, weekday, blockNo);
    }

    private void marcar(Long blockId, Long recordedBy) {
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, recorded_by, recorded_at)
                VALUES (?, ?, ?, ?, 'P', ?, now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING
                """, UUID.randomUUID(), estudianteId, blockId, LocalDate.parse(FECHA), recordedBy);
    }

    @BeforeEach
    void preparar() {
        Long propio = crearDocente("propio@rca.co", "Docente Propio RCA");
        Long otro = crearDocente("otro@rca.co", "Docente Otro RCA");
        bloquePropio = crearBloque(1, propio);
        bloqueAjeno = crearBloque(2, otro);

        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES ('RCA0001', 'ESTUDIANTE', 'RCA', ?, TRUE)
                ON CONFLICT (document_id) DO NOTHING
                """, GRADE);
        estudianteId = jdbcBase.queryForObject(
                "SELECT id FROM students WHERE document_id = 'RCA0001'", Long.class);

        jdbcBase.update("DELETE FROM attendance WHERE student_id = ?", estudianteId);
        marcar(bloquePropio, propio);
        marcar(bloqueAjeno, otro);
    }

    @Test
    void un_docente_solo_ve_las_tomas_de_los_bloques_que_dicta() throws Exception {
        mvc.perform(get("/api/attendance/recientes").param("limite", "50")
                        .header("Authorization", tokenDe("propio@rca.co", "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.blockId == " + bloquePropio + ")]").exists())
           .andExpect(jsonPath("$[?(@.blockId == " + bloqueAjeno + ")]").doesNotExist());
    }

    @Test
    void coordinacion_ve_las_tomas_de_todos_los_bloques() throws Exception {
        mvc.perform(get("/api/attendance/recientes").param("limite", "50")
                        .header("Authorization", tokenDe("propio@rca.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.blockId == " + bloquePropio + ")]").exists())
           .andExpect(jsonPath("$[?(@.blockId == " + bloqueAjeno + ")]").exists());
    }

    @Test
    void cada_toma_dice_el_curso_el_bloque_y_quien_la_registro() throws Exception {
        mvc.perform(get("/api/attendance/recientes").param("limite", "50")
                        .header("Authorization", tokenDe("propio@rca.co", "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.blockId == " + bloquePropio + ")].grade").value(GRADE))
           .andExpect(jsonPath("$[?(@.blockId == " + bloquePropio + ")].total").value(1))
           .andExpect(jsonPath("$[?(@.blockId == " + bloquePropio + ")].recordedByName")
                   .value("Docente Propio RCA"));
    }

    @Test
    void el_limite_nunca_pasa_de_cincuenta_aunque_se_pida_mas() throws Exception {
        // Un limite absurdo no debe poder arrastrar la base entera al panel lateral.
        mvc.perform(get("/api/attendance/recientes").param("limite", "100000")
                        .header("Authorization", tokenDe("propio@rca.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.lessThanOrEqualTo(50)));
    }
}
```

- [ ] **Step 2: Ejecutar y verificar que pasa (el endpoint ya existe)**

```bash
cd app/backend && mvn -o test -Dtest=RecientesTest
```

Esperado: `Tests run: 4, Failures: 0`. Estas pruebas son de caracterización: fijan una conducta que ya funciona pero que nada protegía.

- [ ] **Step 3: Comprobar que la prueba de privacidad realmente falla si se rompe la regla**

Edita temporalmente `AttendanceController.java:141-142` y cambia:

```java
        Long teacherId = ("ADMIN".equals(role) || "COORDINADOR".equals(role))
                ? null : JwtService.currentUserId();
```

por `Long teacherId = null;`. Luego:

```bash
mvn -o test -Dtest=RecientesTest
```

Esperado: FALLA en `un_docente_solo_ve_las_tomas_de_los_bloques_que_dicta`. **Deshaz el cambio** (`git checkout app/backend/src/main/java/co/edu/ggm/asistencia/controller/AttendanceController.java`) y vuelve a ejecutar: 4 en verde.

- [ ] **Step 4: Commit**

```bash
git add app/backend/src/test/java/co/edu/ggm/asistencia/attendance/RecientesTest.java
git commit -m "Probar el filtro por rol de /api/attendance/recientes

Un docente solo ve los bloques que dicta; coordinacion los ve todos. Sin
esta prueba, invertir la condicion no rompia nada visible.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Prueba de `mesPorDia` en `/api/reports/today`

`mesPorDia` alimenta la gráfica del inicio y tiene una regla contraintuitiva: las **ausencias se cuentan por estudiante distinto** (`count(DISTINCT a.student_id) FILTER (WHERE a.status = 'F')`), no por marca. Quien falta el día entero falta a seis clases; contar marcas haría un pico falso de 6x. Nada protege eso hoy.

**Files:**
- Modify: `app/backend/src/test/java/co/edu/ggm/asistencia/report/HoyTest.java`
- Reference: `app/backend/src/main/java/co/edu/ggm/asistencia/repository/ReportRepository.java` (consulta `novedadesPorDia`)

**Interfaces:**
- Consumes: `AbstractIntegrationTest.tokenDe`, `jdbcBase`.
- Produces: nada.

- [ ] **Step 1: Leer cómo prepara datos la clase existente**

```bash
sed -n 1,80p app/backend/src/test/java/co/edu/ggm/asistencia/report/HoyTest.java
```

Fíjate en qué curso y qué documentos usa para no chocar; reutiliza su método de preparación si ya crea bloques y estudiantes.

- [ ] **Step 2: Anadir la prueba que falla**

Añade al final de la clase `HoyTest` (dentro de las llaves) este método. Sustituye `prepararCursoDePrueba()` por el nombre real del helper que viste en el paso 1; si no hay ninguno, copia el patrón de `crearBloque`/`marcar` de `RecientesTest` con el prefijo `HOY`:

```java
    @Test
    void las_ausencias_del_dia_se_cuentan_por_estudiante_y_no_por_marca() throws Exception {
        // Un estudiante que falta a sus 3 bloques del dia es UNA ausencia en la
        // grafica, no tres: si no, un dia normal parece una catastrofe.
        var ctx = prepararCursoDePrueba();
        LocalDate hoy = LocalDate.now(java.time.ZoneId.of("America/Bogota"))
                                 .withDayOfMonth(1).plusDays(0);

        for (long bloque : ctx.bloques()) {
            jdbcBase.update("""
                    INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                            status, recorded_by, recorded_at)
                    VALUES (?, ?, ?, ?, 'F', ?, now())
                    ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING
                    """, UUID.randomUUID(), ctx.estudianteId(), bloque, hoy, ctx.docenteId());
        }

        mvc.perform(get("/api/reports/today")
                        .header("Authorization", tokenDe(ctx.correoDocente(), "ADMIN")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.mesPorDia[?(@.classDate == '" + hoy + "')].absent").value(1));
    }
```

- [ ] **Step 3: Ejecutar y ver el resultado**

```bash
cd app/backend && mvn -o test -Dtest=HoyTest
```

Si falla por compilación (el helper `prepararCursoDePrueba()` no existe con esa firma), créalo tú siguiendo el patrón de `RecientesTest`: un `record Ctx(Long estudianteId, Long docenteId, String correoDocente, List<Long> bloques)` devuelto por un método privado que inserta tres bloques del mismo día para el mismo curso.

- [ ] **Step 4: Confirmar que la prueba detecta el error que evita**

Edita `ReportRepository.novedadesPorDia` y cambia `count(DISTINCT a.student_id) FILTER (WHERE a.status = 'F')` por `count(*) FILTER (WHERE a.status = 'F')`.

```bash
mvn -o test -Dtest=HoyTest
```

Esperado: FALLA con `expected 1 but was 3`. Deshaz el cambio y vuelve a ejecutar: verde.

- [ ] **Step 5: Commit**

```bash
git add app/backend/src/test/java/co/edu/ggm/asistencia/report/HoyTest.java
git commit -m "Probar que mesPorDia cuenta ausencias por estudiante, no por marca

Contar marcas multiplicaba por seis las faltas de dia completo en la
grafica del inicio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Prueba de la pantalla `RegistroClase`

`app/frontend/src/pages/RegistroClase.tsx` se creó sin pruebas. Es la pantalla donde coordinación edita y borra asistencia registrada: lo más destructivo que ofrece el sistema a un usuario.

**Files:**
- Create: `app/frontend/src/pages/RegistroClase.test.tsx`
- Reference: `app/frontend/src/pages/RegistroClase.tsx`
- Reference (patrón de `respuesta()` y `MemoryRouter` con ruta parametrizada): `app/frontend/src/pages/Horario.test.tsx:14-26`

**Interfaces:**
- Consumes: el componente `RegistroClase` (export default), y el contrato `AttendanceDetalle` de `../api/contract`.
- Produces: nada.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crea `app/frontend/src/pages/RegistroClase.test.tsx`:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RegistroClase from './RegistroClase';

const DETALLE = [
  { id: 'a1', studentId: 10, fullName: 'ANA LOPEZ', documentId: '111',
    status: 'P', recordedByName: 'Marta Restrepo', recordedAt: '2026-08-21T12:10:00Z' },
  { id: 'b2', studentId: 11, fullName: 'BETO RUIZ', documentId: '222',
    status: 'F', comment: 'Cita medica', recordedByName: 'Marta Restrepo',
    recordedAt: '2026-08-21T12:10:00Z' },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function pintar() {
  localStorage.setItem('ggm.session', JSON.stringify({
    token: 't', refreshToken: 'r', role: 'COORDINADOR', fullName: 'Coord Persona',
    userId: 9, mustChangePassword: false,
  }));
  return render(
    <MemoryRouter initialEntries={['/asistencia/7/2026-08-21?curso=6A&bloque=3&materia=Espanol']}>
      <Routes>
        <Route path="/asistencia/:blockId/:fecha" element={<RegistroClase />} />
      </Routes>
    </MemoryRouter>);
}

describe('RegistroClase', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DETALLE)));
  });

  it('muestra el curso, el bloque y la materia que vienen en la URL', async () => {
    pintar();
    expect(await screen.findByRole('heading', { name: /6A/ })).toHaveTextContent(/Bloque 3/);
    expect(screen.getByRole('heading', { name: /6A/ })).toHaveTextContent(/Espanol/);
  });

  it('lista todos los estudiantes con su estado y quien tomo la lista', async () => {
    pintar();
    expect(await screen.findByText('ANA LOPEZ')).toBeInTheDocument();
    expect(screen.getByText('BETO RUIZ')).toBeInTheDocument();
    expect(screen.getByText('Cita medica')).toBeInTheDocument();
    expect(screen.getAllByText(/Marta Restrepo/).length).toBe(2);
  });

  it('resume cuantos hay de cada estado', async () => {
    pintar();
    // 2 estudiantes: uno presente, uno con falta.
    expect(await screen.findByText(/2 estudiantes/)).toBeInTheDocument();
    expect(screen.getByText(/1 presente/)).toBeInTheDocument();
    expect(screen.getByText(/1 falta/)).toBeInTheDocument();
  });

  it('al editar envia un PUT con el nuevo estado y recarga', async () => {
    const llamadas: { url: string; metodo?: string; cuerpo?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, metodo: init?.method, cuerpo: init?.body as string });
      return respuesta(DETALLE);
    }));

    pintar();
    await screen.findByText('ANA LOPEZ');
    const fila = screen.getByText('ANA LOPEZ').closest('li') as HTMLElement;
    await userEvent.click(within(fila).getByRole('button', { name: /editar/i }));
    await userEvent.selectOptions(
      screen.getByLabelText(/nuevo estado de ANA LOPEZ/i), 'T');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(
      llamadas.some((l) => l.metodo === 'PUT' && l.url.includes('/api/attendance/a1'))).toBe(true));
    const put = llamadas.find((l) => l.metodo === 'PUT')!;
    expect(put.cuerpo).toContain('"status":"T"');
  });

  it('borrar pide confirmacion y no borra si se cancela', async () => {
    const llamadas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method) llamadas.push(init.method);
      return respuesta(DETALLE);
    }));
    vi.stubGlobal('confirm', vi.fn(() => false));

    pintar();
    await screen.findByText('ANA LOPEZ');
    const fila = screen.getByText('ANA LOPEZ').closest('li') as HTMLElement;
    await userEvent.click(within(fila).getByRole('button', { name: /borrar/i }));

    expect(llamadas).not.toContain('DELETE');
  });

  it('si la carga falla lo dice en vez de mostrar una lista vacia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    pintar();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar**

```bash
cd app/frontend && npx vitest run src/pages/RegistroClase.test.tsx
```

Esperado: 6 pruebas. Si alguna falla por el texto exacto del resumen (`1 presente` / `1 falta`), abre `RegistroClase.tsx` y mira cómo compone esa línea: usa `ESTADOS[].etiqueta` en minúsculas (`presente`, `tarde`, `falta`, `evasion`). Ajusta la expectativa al texto real, **no al revés**.

- [ ] **Step 3: Verificar el caso destructivo con confirmación aceptada**

Añade una prueba más al final del `describe`:

```tsx
  it('borrar con confirmacion aceptada envia el DELETE', async () => {
    const llamadas: { url: string; metodo?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, metodo: init?.method });
      return respuesta(DETALLE);
    }));
    vi.stubGlobal('confirm', vi.fn(() => true));

    pintar();
    await screen.findByText('ANA LOPEZ');
    const fila = screen.getByText('ANA LOPEZ').closest('li') as HTMLElement;
    await userEvent.click(within(fila).getByRole('button', { name: /borrar/i }));

    await waitFor(() => expect(llamadas.some(
      (l) => l.metodo === 'DELETE' && l.url.includes('/api/attendance/a1'))).toBe(true));
  });
```

```bash
npx vitest run src/pages/RegistroClase.test.tsx
```

Esperado: 7 en verde.

- [ ] **Step 4: Commit**

```bash
git add app/frontend/src/pages/RegistroClase.test.tsx
git commit -m "Probar la pantalla de registro por curso

Cubre el titulo desde la URL, la lista con autoria, el resumen por estado,
el PUT de edicion y que borrar respete la confirmacion.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Prueba del panel de últimos llamados en `/asistencia`

El panel lateral se construyó sin prueba. Lo que hay que fijar es que cada sesión enlaza a la URL correcta: si el enlace pierde la fecha o el `blockId`, la pantalla de CRUD abre el curso equivocado y alguien edita la asistencia de otro día.

**Files:**
- Modify: `app/frontend/src/pages/TomarAsistencia.test.tsx`
- Reference: `app/frontend/src/pages/TomarAsistencia.tsx` (bloque `<aside className="card">`)

**Interfaces:**
- Consumes: el componente `TomarAsistencia`, y `db` de `../db/local` (ya importado en el fichero).
- Produces: nada.

- [ ] **Step 1: Anadir el describe nuevo al final del fichero**

Añade al final de `app/frontend/src/pages/TomarAsistencia.test.tsx`, fuera del `describe` existente:

```tsx
describe('TomarAsistencia: panel de ultimos llamados', () => {
  const SESIONES = [
    { blockId: 7, grade: '6A', blockNo: 3, subject: 'Espanol', classDate: '2026-08-21',
      total: 25, recordedByName: 'Marta Restrepo', lastRecordedAt: '2026-08-21T12:10:00Z' },
    { blockId: 9, grade: '11A', blockNo: 6, subject: 'Sociales', classDate: '2026-08-20',
      total: 24, recordedByName: 'Carmen Velasquez', lastRecordedAt: '2026-08-20T18:30:00Z' },
  ];

  beforeEach(async () => {
    await db.blocks.clear();
    await db.students.clear();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const cuerpo = url.includes('/api/attendance/recientes') ? SESIONES : [];
      return new Response(JSON.stringify(cuerpo),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
  });

  it('lista las ultimas tomas con curso, bloque, materia y quien la registro', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    expect(await screen.findByText(/6A · Bloque 3 · Espanol/)).toBeInTheDocument();
    expect(screen.getByText(/Carmen Velasquez/)).toBeInTheDocument();
  });

  it('cada toma enlaza a su propia URL con el bloque y la fecha', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    const enlace = (await screen.findByText(/6A · Bloque 3 · Espanol/)).closest('a');
    // Sin blockId y fecha correctos se abriria el curso o el dia equivocado.
    expect(enlace).toHaveAttribute('href', expect.stringContaining('/asistencia/7/2026-08-21'));
    expect(enlace?.getAttribute('href')).toContain('curso=6A');
  });

  it('sin conexion el panel queda vacio pero la planilla sigue usable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    expect(await screen.findByText(/todavia no hay tomas de lista/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/curso/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar**

```bash
cd app/frontend && npx vitest run src/pages/TomarAsistencia.test.tsx
```

Esperado: 25 pruebas (22 previas + 3). Si `toHaveAttribute('href', expect.stringContaining(...))` da problemas con la versión de jest-dom instalada, usa `expect(enlace?.getAttribute('href')).toContain('/asistencia/7/2026-08-21')`.

- [ ] **Step 3: Suite completa de frontend**

```bash
npx vitest run
```

Esperado: 174 + 3 + 7 (de la Task 4) = **184 en verde**.

- [ ] **Step 4: Commit**

```bash
git add app/frontend/src/pages/TomarAsistencia.test.tsx
git commit -m "Probar el panel de ultimos llamados de lista

Fija que cada toma enlaza a /asistencia/:blockId/:fecha con su curso, y
que sin conexion el panel se vacia sin romper la planilla.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Retirar las semillas obsoletas y documentar la vigente

`tools/datos-locales.sql` y `tools/datos-realistas.sql` siembran los cursos `601..607`, que `tools/datos-colegio.sql` borra explícitamente. Quien las ejecute hoy se crea datos que la siembra buena elimina. Además el `README.md` no menciona ninguna semilla ni los usuarios nuevos.

**Files:**
- Delete: `tools/datos-locales.sql`, `tools/datos-realistas.sql`
- Modify: `README.md`
- Keep: `tools/datos-de-carga.sql` (rendimiento) y `tools/datos-estructura-real.sql` (comprobar la estructura, no siembra de demo) — **no los borres**

**Interfaces:**
- Consumes: nada.
- Produces: `README.md` como única fuente de verdad sobre cómo sembrar.

- [ ] **Step 1: Confirmar que nada las referencia**

```bash
cd /c/Users/Julian/Downloads/sistema-control-asistencia
grep -rn "datos-locales\|datos-realistas" --include=*.md --include=*.sh --include=*.yml --include=*.sql . | grep -v "^./.worktrees" | grep -v "^./.superpowers"
```

Esperado: solo el comentario de cabecera de `tools/datos-realistas.sql` (que se refiere a sí misma) y la nota de `tools/datos-colegio.sql` que dice que las reemplaza. Si aparece `tools/humo.sh` u otro script, **para**: hay que actualizarlo antes de borrar.

- [ ] **Step 2: Borrarlas**

```bash
git rm tools/datos-locales.sql tools/datos-realistas.sql
```

- [ ] **Step 3: Quitar la referencia en datos-colegio.sql**

En `tools/datos-colegio.sql`, cambia la línea de cabecera:

```
-- Reemplaza a tools/datos-locales.sql + tools/datos-realistas.sql, que sembraban
-- solo los cursos 601..607. BORRA esos datos de demostracion (estudiantes con
```

por:

```
-- Es la unica siembra de demostracion del proyecto. BORRA los datos de las
-- siembras viejas de los cursos 601..607 si siguen en la base (estudiantes con
```

- [ ] **Step 4: Documentar la siembra en el README**

Añade en `README.md`, justo después de la línea 104 (la que habla de los usuarios semilla), esta sección:

```markdown
### Datos de demostración

Las migraciones crean solo tres usuarios y tres estudiantes: lo justo para que
arranque. Para ver el sistema con un colegio dentro:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d asistencia -f tools/datos-colegio.sql
```

Siembra 12 cursos (`0A` a `11A`) con 25 estudiantes cada uno, 12 docentes con su
materia, el horario de 7:00 a 1:30 (6 bloques de 60 minutos con descanso de 10:00
a 10:30) y la asistencia del mes en curso. Es idempotente: se puede repetir.

| Usuario | Clave | Rol |
|---|---|---|
| `admin@ggm.edu.co` | `cambiar123` | administración |
| `coord@ggm.edu.co` | `cambiar123` | coordinación |
| `docente01@ggm.edu.co` … `docente12@ggm.edu.co` | `cambiar123` | docentes |
| `acudiente.<documento>@correo.com` | `cambiar123` | acudientes |

Para medir rendimiento con 620.000 registros existe `tools/datos-de-carga.sql`,
que va contra la base `asistencia_carga` (ver `app/README.md`).
```

- [ ] **Step 5: Verificar que la siembra sigue corriendo limpia**

```bash
PGPASSWORD=postgres "/c/Program Files/PostgreSQL/16/bin/psql.exe" -U postgres -d asistencia -v ON_ERROR_STOP=1 -f tools/datos-colegio.sql | tail -12
```

Esperado: la tabla de conteos final, sin errores. `cursos = 12`, `estudiantes = 300`, `docentes = 12`.

- [ ] **Step 6: Commit**

```bash
git add -A tools README.md
git commit -m "Retirar las semillas de los cursos 601..607 y documentar la vigente

datos-colegio.sql borraba lo que datos-locales.sql y datos-realistas.sql
sembraban: tenerlas invitaba a ejecutar la que no era.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Completar los datos de demostración

Tres huecos reales que se ven al usar la aplicación:

1. **Portería vacía:** `entry_log` no tiene ni una fila, así que el KPI "Ingresos por portería" siempre marca 0 y `/ingreso` no se puede revisar con datos.
2. **Un solo mes:** la asistencia empieza el día 1 del mes en curso. El 24, 25 y 26 de agosto son `INSTITUCIONAL`, así que hoy la aplicación se ve casi vacía y las consultas de "esta semana" no devuelven nada.
3. **Un solo acudiente por estudiante:** nadie tiene dos hijos, y esa es justo la pantalla del portal del acudiente que conviene poder mirar.

**Files:**
- Modify: `tools/datos-colegio.sql` (secciones 5 y 6, y el resumen final)

**Interfaces:**
- Consumes: las tablas temporales `semilla_cursos`, `semilla_nombres`, `semilla_par` que ya crea el script.
- Produces: un script que sigue siendo idempotente.

- [ ] **Step 1: Ampliar la asistencia al mes anterior**

En `tools/datos-colegio.sql`, dentro del `INSERT INTO attendance` de la sección 5, cambia la condición de fecha:

```sql
                      AND c.calendar_date >= date_trunc('month', CURRENT_DATE)::date
```

por:

```sql
                      -- Dos meses: con uno solo, una semana institucional al final del
                      -- mes deja la aplicacion vacia justo el dia que se quiere enseñar.
                      AND c.calendar_date >= (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date
```

- [ ] **Step 2: Sembrar los ingresos por porteria**

Añade una sección nueva justo antes de `-- 6. Un acudiente por estudiante`:

```sql
-- 5b. Ingresos por porteria ------------------------------------------------------
-- El carne se pasa una vez por dia al entrar. No entra todo el mundo: quien falto el
-- dia completo no tiene ingreso, que es justo lo que hace util cruzar las dos cosas.
INSERT INTO entry_log (id, student_id, entry_date, scanned_at, recorded_by)
SELECT gen_random_uuid(), d.student_id, d.class_date,
       d.class_date + TIME '06:35' + (random() * 40)::int * INTERVAL '1 minute',
       (SELECT id FROM users WHERE email = 'coord@ggm.edu.co')
FROM (SELECT DISTINCT a.student_id, a.class_date
        FROM attendance a
       WHERE a.deleted_at IS NULL
       GROUP BY a.student_id, a.class_date
      HAVING count(*) FILTER (WHERE a.status = 'F') = 0) d
ON CONFLICT ON CONSTRAINT entry_unique_day DO NOTHING;
```

- [ ] **Step 3: Dar dos hijos a un acudiente**

Añade después del `INSERT INTO guardianships` existente:

```sql
-- Un acudiente con dos hijos en cursos distintos: es la unica forma de ver el
-- portal del acudiente con mas de un estudiante, y esa pantalla tiene logica propia.
INSERT INTO guardianships (student_id, guardian_id, relationship)
SELECT s2.id, u.id, 'Padre'
FROM students s1
JOIN users u ON u.email = 'acudiente.' || s1.document_id || '@correo.com'
JOIN students s2 ON s2.grade = '9A' AND s2.document_id LIKE '%01'
WHERE s1.grade = '6A' AND s1.document_id LIKE '%01'
ON CONFLICT (student_id, guardian_id) DO NOTHING;
```

- [ ] **Step 4: Anadir los ingresos al resumen final**

En el `SELECT` final del script, añade una fila más antes de la de acudientes:

```sql
UNION ALL SELECT 'ingresos',    count(*) FROM entry_log
```

- [ ] **Step 5: Ejecutar la siembra y comprobar los tres huecos**

```bash
cd /c/Users/Julian/Downloads/sistema-control-asistencia
PGPASSWORD=postgres "/c/Program Files/PostgreSQL/16/bin/psql.exe" -U postgres -d asistencia -v ON_ERROR_STOP=1 -f tools/datos-colegio.sql | tail -14
```

Esperado: `ingresos` > 0, `asistencias` claramente mayor que antes (dos meses), y sin errores.

```bash
PGPASSWORD=postgres "/c/Program Files/PostgreSQL/16/bin/psql.exe" -U postgres -d asistencia \
  -c "SELECT count(*) AS acudientes_con_dos_hijos FROM (SELECT guardian_id FROM guardianships GROUP BY 1 HAVING count(*) > 1) x;" \
  -c "SELECT min(class_date), max(class_date) FROM attendance;"
```

Esperado: `acudientes_con_dos_hijos = 1`, y un rango de fechas que cubre dos meses.

- [ ] **Step 6: Ejecutarla dos veces seguidas para probar la idempotencia**

```bash
PGPASSWORD=postgres "/c/Program Files/PostgreSQL/16/bin/psql.exe" -U postgres -d asistencia -v ON_ERROR_STOP=1 -f tools/datos-colegio.sql | tail -14
```

Esperado: los mismos conteos de estudiantes, docentes, cursos e ingresos que en el paso 5. Si `asistencias` sube mucho, el `ON CONFLICT` de attendance no está cubriendo algo: revísalo antes de commitear.

- [ ] **Step 7: Commit**

```bash
git add tools/datos-colegio.sql
git commit -m "Sembrar porteria, dos meses de asistencia y un acudiente con dos hijos

Con un solo mes, la semana institucional del final dejaba la aplicacion
vacia; sin entry_log el KPI de porteria siempre marcaba cero.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Quitar el tope de tres segmentos del enrutado de la SPA

`SpaConfig` reenvía al index las rutas de uno, dos y tres segmentos. Es un tope arbitrario: la cuarta ruta anidada que alguien añada volverá a dar 404 al recargar, y el síntoma (funciona navegando, falla al recargar) es de los que cuestan una tarde.

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/config/SpaConfig.java`
- Modify: `app/backend/src/test/java/co/edu/ggm/asistencia/config/SpaRoutingTest.java`

**Interfaces:**
- Consumes: nada.
- Produces: `SpaConfig` que cubre cualquier profundidad sin tocar `/api` ni ficheros con extensión.

- [ ] **Step 1: Escribir la prueba de cuatro segmentos, que falla hoy**

Añade a `SpaRoutingTest`:

```java
    @Test
    void una_ruta_de_cuatro_segmentos_tambien_reenvia_al_index() throws Exception {
        // El numero de segmentos no debe ser una regla del servidor: lo decide el
        // router del frontend.
        mvc.perform(get("/a/b/c/d")).andExpect(forwardedUrl("/index.html"));
    }
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app/backend && mvn -o test -Dtest=SpaRoutingTest
```

Esperado: FALLA con `Forwarded URL expected:</index.html> but was:<null>` (lo atiende el manejador de estáticos y da 404).

- [ ] **Step 3: Implementar el reenvio con un controlador explicito**

`ViewControllerRegistry` no admite un patrón de profundidad libre que gane al manejador de recursos, así que se resuelve con un `@Controller`. Sustituye el contenido completo de `SpaConfig.java` por:

```java
package co.edu.ggm.asistencia.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Reenvia las rutas de React Router al index de la SPA, a cualquier profundidad.
 *
 * El patron excluye lo que lleva punto (ficheros como .js o .png, que deben dar 404
 * de verdad si no existen) y no toca /api, que resuelve antes por ser mas especifico.
 * Antes esto eran patrones de un segmento, luego de tres: cada ruta anidada nueva
 * volvia a dar 404 al recargar, aunque navegando funcionara.
 */
@Controller
public class SpaConfig {

    @GetMapping({"/{ruta:[^\\.]*}",
                 "/{ruta:[^\\.]*}/**/{sub:[^\\.]*}"})
    public String spa() {
        return "forward:/index.html";
    }
}
```

- [ ] **Step 4: Ejecutar las cinco pruebas de enrutado**

```bash
mvn -o test -Dtest=SpaRoutingTest
```

Esperado: 6 pruebas en verde. Deben seguir pasando `las_rutas_de_api_no_se_reenvian` (401, no el index) y `los_ficheros_con_extension_no_se_reenvian` (404). **Si alguna de esas dos se pone roja, el patrón está capturando de más: no la relajes, arregla el patrón.**

- [ ] **Step 5: Suite completa del backend**

```bash
mvn -o test
```

Esperado: 175 + las nuevas de las tareas 2 y 3, todas en verde.

- [ ] **Step 6: Comprobarlo contra el servidor de verdad**

```bash
cd /c/Users/Julian/Downloads/sistema-control-asistencia/app/backend
DB_USER=postgres DB_PASSWORD=postgres mvn -o spring-boot:run > /tmp/backend.log 2>&1 &
until grep -q "Started AsistenciaApplication" /tmp/backend.log; do sleep 3; done
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/asistencia/421/2026-08-21
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/assets/no-existe.js
```

Esperado: `200` y luego `404`.

- [ ] **Step 7: Commit**

```bash
git add app/backend/src/main/java/co/edu/ggm/asistencia/config/SpaConfig.java \
        app/backend/src/test/java/co/edu/ggm/asistencia/config/SpaRoutingTest.java
git commit -m "Reenviar al index las rutas de la SPA a cualquier profundidad

El tope de tres segmentos era arbitrario: la siguiente ruta anidada
volveria a dar 404 al recargar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Alternativa en tabla para la gráfica del inicio

Todas las gráficas del sistema ofrecen "Ver tabla" (`BarrasPorCurso.tsx:88-92`). La nueva `LineasNovedades` no: sus datos solo existen como SVG, ilegibles con lector de pantalla y sin forma de leer el valor exacto de un día sin pasar el ratón — imposible en un móvil.

**Files:**
- Modify: `app/frontend/src/components/charts/LineasNovedades.tsx`
- Create: `app/frontend/src/components/charts/LineasNovedades.test.tsx`
- Reference (patrón del botón y la tabla): `app/frontend/src/components/charts/BarrasPorCurso.tsx`

**Interfaces:**
- Consumes: el tipo exportado `DiaMes` de `LineasNovedades.tsx` (`{ classDate: string; late: number; absent: number; evasion: number }`).
- Produces: el mismo componente `LineasNovedades`, con la misma prop `serie: DiaMes[]`. Ninguna otra tarea depende de esto.

- [ ] **Step 1: Escribir la prueba que falla**

Crea `app/frontend/src/components/charts/LineasNovedades.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import LineasNovedades from './LineasNovedades';

const SERIE = [
  { classDate: '2026-08-04', late: 2, absent: 1, evasion: 0 },
  { classDate: '2026-08-05', late: 5, absent: 3, evasion: 2 },
];

describe('LineasNovedades', () => {
  it('sin datos no pinta nada', () => {
    const { container } = render(<LineasNovedades serie={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('la grafica tiene una descripcion para lector de pantalla', () => {
    render(<LineasNovedades serie={SERIE} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/novedades por dia/i);
  });

  it('ofrece ver los mismos datos en tabla', async () => {
    render(<LineasNovedades serie={SERIE} />);
    await userEvent.click(screen.getByRole('button', { name: /ver tabla/i }));

    const tabla = screen.getByRole('table');
    expect(tabla).toHaveTextContent('4');    // dia
    expect(tabla).toHaveTextContent('5');    // llegadas tarde del dia 5
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('desde la tabla se puede volver a la grafica', async () => {
    render(<LineasNovedades serie={SERIE} />);
    await userEvent.click(screen.getByRole('button', { name: /ver tabla/i }));
    await userEvent.click(screen.getByRole('button', { name: /ver grafica/i }));
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app/frontend && npx vitest run src/components/charts/LineasNovedades.test.tsx
```

Esperado: fallan las dos últimas — no existe el botón "Ver tabla".

- [ ] **Step 3: Implementar el conmutador**

En `LineasNovedades.tsx`, añade el estado junto al que ya existe:

```tsx
  const [tabla, setTabla] = useState(false);
```

Envuelve el `<svg>...</svg>` completo en `{!tabla && ( ... )}` y añade justo después, antes del `<figcaption>`:

```tsx
      {tabla && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>Dia</th>{SERIES.map((s) => <th key={s.clave} className="num">{s.etiqueta}</th>)}</tr>
            </thead>
            <tbody>
              {serie.map((p) => (
                <tr key={p.classDate}>
                  <td>{dia(p.classDate)}</td>
                  {SERIES.map((s) => <td key={s.clave} className="num">{p[s.clave]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
```

Y dentro del `<figcaption>`, al final, el botón:

```tsx
        <button type="button" className="secundario"
                style={{ minHeight: 28, padding: '2px 8px', marginLeft: 'auto' }}
                onClick={() => setTabla(!tabla)}>
          {tabla ? 'Ver grafica' : 'Ver tabla'}
        </button>
```

- [ ] **Step 4: Ejecutar**

```bash
npx vitest run src/components/charts/LineasNovedades.test.tsx
```

Esperado: 4 en verde.

- [ ] **Step 5: Suite completa y despliegue local**

```bash
npx vitest run
cd /c/Users/Julian/Downloads/sistema-control-asistencia && bash tools/refrescar-web.sh
```

Si `refrescar-web.sh` falla en `target/classes/static` porque el backend está corriendo:

```bash
rm -rf app/backend/target/classes/static/assets
cp -r app/frontend/dist/. app/backend/target/classes/static/
```

Luego abre `localhost:8080` con Ctrl+Shift+R y comprueba que el botón "Ver tabla" aparece bajo la gráfica del inicio.

- [ ] **Step 6: Commit**

```bash
git add app/frontend/src/components/charts/LineasNovedades.tsx \
        app/frontend/src/components/charts/LineasNovedades.test.tsx
git commit -m "Ofrecer los datos de la grafica del inicio tambien en tabla

Como el resto de graficas del sistema: el valor exacto de un dia no puede
depender de pasar el raton, que en un movil no existe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Cerrar la deuda `ponytail:` de estado en memoria

Hay dos atajos marcados en el código que hoy son correctos y mañana son un fallo silencioso en producción:

- `CalendarService.java:25` — caché del calendario en un `Set` en memoria.
- `LoginAttemptService.java:18` — contador de intentos de login en memoria.

Con **una** instancia del backend ambos funcionan. Con dos (que es lo que pasa al escalar en Fly.io), el bloqueo por intentos fallidos se evade cambiando de instancia: es un agujero de seguridad, no una optimización pendiente.

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/service/LoginAttemptService.java` (solo comentario + comprobación de arranque)
- Modify: `fly.toml` (documentar el límite)
- Reference: `app/backend/src/main/java/co/edu/ggm/asistencia/service/CalendarService.java:25`

**Interfaces:**
- Consumes: nada.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Comprobar cuantas instancias declara fly.toml**

```bash
cd /c/Users/Julian/Downloads/sistema-control-asistencia
cat fly.toml
```

Anota si hay `min_machines_running` o `auto_stop_machines`. Si el fichero permite más de una máquina, el agujero ya existe hoy.

- [ ] **Step 2: Escribir la prueba que documenta el limite**

Crea `app/backend/src/test/java/co/edu/ggm/asistencia/user/IntentosLoginUnaInstanciaTest.java`:

```java
package co.edu.ggm.asistencia.user;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.LoginAttemptService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * El bloqueo por intentos fallidos vive en memoria del proceso. Esta prueba no
 * arregla eso: lo deja escrito, para que quien anada una segunda instancia del
 * backend se encuentre con el aviso antes que con el incidente.
 */
class IntentosLoginUnaInstanciaTest extends AbstractIntegrationTest {

    @Autowired LoginAttemptService intentos;

    @Test
    void el_contador_de_intentos_es_por_proceso() {
        String correo = "limite@ggm.edu.co";
        for (int i = 0; i < 5; i++) intentos.fail(correo);

        // check() lanza 429 cuando el correo esta bloqueado; no devuelve un booleano.
        assertThatThrownBy(() -> intentos.check(correo))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("429");

        // Una instancia nueva del servicio no sabe nada de esos intentos: eso es
        // exactamente lo que pasa con dos maquinas detras del balanceador.
        LoginAttemptService otraInstancia = new LoginAttemptService();
        assertThatCode(() -> otraInstancia.check(correo)).doesNotThrowAnyException();
    }
}
```

- [ ] **Step 3: Ejecutar la prueba**

El servicio tiene tres metodos publicos — `check(String)` (lanza 429), `fail(String)` y `success(String)` — y constructor por defecto sin dependencias, asi que el codigo de arriba compila tal cual. El maximo son 5 fallos y el bloqueo dura 15 minutos (`LoginAttemptService:25-26`).

```bash
cd app/backend && mvn -o test -Dtest=IntentosLoginUnaInstanciaTest
```

Esperado: verde.

- [ ] **Step 4: Dejar el aviso donde se despliega**

En `fly.toml`, añade al principio del fichero:

```toml
# OJO: una sola maquina. El bloqueo por intentos de login y la cache del calendario
# viven en memoria del proceso (ver LoginAttemptService y CalendarService). Con dos
# maquinas, un atacante evade el bloqueo alternando instancias. Antes de subir el
# numero de maquinas hay que mover esos dos contadores a la base de datos o a Redis.
```

- [ ] **Step 5: Ejecutar la suite completa del backend**

```bash
mvn -o test
```

Esperado: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add app/backend/src/test/java/co/edu/ggm/asistencia/user/IntentosLoginUnaInstanciaTest.java fly.toml
git commit -m "Dejar escrito que el bloqueo de login no sobrevive a dos instancias

Con dos maquinas detras del balanceador el limite de intentos se evade
alternando instancia. La prueba y el aviso en fly.toml hacen visible el
limite antes de que alguien suba el numero de maquinas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Cierre

- [ ] **Verificación final**

```bash
cd /c/Users/Julian/Downloads/sistema-control-asistencia
cd app/frontend && npx vitest run
cd ../backend && mvn -o test
cd ../.. && git status --short && git log --oneline -12
```

Esperado: frontend y backend en verde, árbol limpio, y los commits de las diez tareas en el historial.

## Fuera de alcance (deliberadamente)

- **Segundo grupo por grado (`0B`, `1B`…).** La semilla usa un grupo por grado. Añadir un segundo grupo obliga a 24 docentes para no cruzar horarios; se hace cuando haga falta probar traslados entre grupos.
- **Mover `CalendarService` y `LoginAttemptService` a la base de datos.** La Task 10 documenta el límite; moverlos es un cambio de arquitectura que solo se justifica el día que se escale a dos máquinas.
- **Rediseño del tablero (`/dashboard`).** No hay ninguna queja concreta sobre él en esta sesión.
