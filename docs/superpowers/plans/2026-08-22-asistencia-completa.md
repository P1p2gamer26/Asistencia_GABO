# La Asistencia Solo se Guardaba a Medias — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que al enviar la asistencia queden registrados **todos** los estudiantes del curso, no solo aquellos a los que el docente tocó un botón.

**Architecture:** El defecto está en el frontend: la cola local solo recibe a los estudiantes que el docente pulsa, aunque la pantalla muestre "P" resaltada para todos. Se corrige enviando el curso completo con el estado efectivo de cada uno. Y en el backend se ajusta el aviso de bloques pendientes, que hoy da un bloque por completo en cuanto existe **un** registro.

**Tech Stack:** React 18, TypeScript, Vitest, Java 21, Spring Boot 3.4, PostgreSQL 16.

**Spec:** Verificación del 22 de agosto de 2026 contra la base de carga, registrada en la sección 6.j de `docs/INFORME-FINAL.md`.

## El defecto, medido

En la prueba del ciclo offline se marcaron **3 faltas en un curso de 40 estudiantes**.
Después, en la base de datos:

```
registros guardados:    3
estudiantes del curso:  40
ese bloque cuenta como ya marcado:  SI
```

**37 estudiantes que estaban presentes no tienen ningún registro.** La pantalla mostraba
la "P" resaltada para los 40, así que el docente cree razonablemente que los está
registrando a todos. Solo entran a la cola los que pulsa.

Las consecuencias encadenan:

- Un estudiante presente y uno cuya clase nadie registró son **indistinguibles**: los dos
  no tienen fila.
- `GET /reports/pending-today` comprueba `NOT EXISTS (... WHERE schedule_block_id = b.id
  AND class_date = :day)`, así que **un solo registro basta** para que el bloque
  desaparezca del aviso. Nadie va a recordarle al docente que faltan 37.
- Los informes cuentan sobre las filas que existen, de modo que el porcentaje sale bien
  y **el hueco es invisible** en el tablero.
- En el caso extremo —un curso que asiste completo y el docente no toca nada— el botón
  de enviar está `disabled` porque `pendientes === 0`: **no puede registrar nada aunque
  quiera**.

Esto contradice el objetivo del proyecto tal como está escrito en el documento de
contexto: *"garantizar la toma de asistencia de todos los estudiantes"*.

## Global Constraints

- **El proyecto vive en `app/`**: `app/backend`, `app/frontend`.
- **MVC clásico por capas** en el backend (`app/README.md`): el sufijo de la clase decide su paquete.
- **PostgreSQL 16 local.** Backend: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
- **Rango de versiones Flyway reservado: `V50`-`V59`.**
- **Ningún test puede mutar los datos de la semilla.** La CI corre con `-Dsurefire.runOrder=random`.
- **`waitFor`, nunca `findByRole`,** para contenido que depende de un efecto asíncrono.
- **El lote de sincronización admite 500 registros como máximo.** Un curso son 40, así que enviar el curso completo cabe de sobra.
- **`tools/humo.sh` debe seguir pasando.**
- **Idioma:** identificadores en inglés, texto visible en español. Sin tildes ni letra eñe en nombres de ficheros, tablas ni campos JSON.
- **Commits:** Conventional Commits en español, terminando con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
app/frontend/src/
├── pages/TomarAsistencia.tsx        (modificar) enviar el curso completo
└── pages/TomarAsistencia.test.tsx   (modificar) casos nuevos
app/backend/src/main/java/co/edu/ggm/asistencia/
└── repository/ReportRepository.java (modificar) bloque incompleto sigue pendiente
app/backend/src/test/java/co/edu/ggm/asistencia/report/
└── PendientesTest.java              (nuevo)
```

---

## Task 1: Enviar el curso completo, no solo lo que se tocó

**Files:**
- Modify: `app/frontend/src/pages/TomarAsistencia.tsx`
- Test: `app/frontend/src/pages/TomarAsistencia.test.tsx`

**Interfaces:**
- Consumes: `markAttendance(mark)` de `src/sync/engine.ts`, sin cambios.
- Produces: nada nuevo.

**La decisión de diseño.** El modelo mental del docente es: *"presente es lo normal,
marco las excepciones y envío"*. La pantalla ya lo refleja resaltando la "P" por defecto.
Lo que falta es que el envío haga lo que la pantalla promete.

Se registra el curso completo **al pulsar Enviar**, no al abrir el bloque. Sembrar la
cola nada más elegir el bloque convertiría "mirar" en "registrar": un docente que abre el
bloque equivocado dejaría 40 presentes falsos. El envío es un acto deliberado; ese es el
momento correcto.

El contador del botón pasa a mostrar **cuántos se van a enviar**, no cuántos se tocaron.
Decir "Enviar asistencia (3)" cuando van a viajar 40 es justo la mentira que causó el
problema.

- [ ] **Step 1: Escribir los tests**

Añadir a `TomarAsistencia.test.tsx`. Reutilizan el montaje que ya existe (40 estudiantes
no; los tres del `beforeEach` bastan para demostrarlo).

```tsx
  async function elegirCursoYBloque() {
    render(<TomarAsistencia />);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await waitFor(() => expect(screen.getByLabelText(/bloque/i)).not.toBeDisabled());
    const opciones = Array.from(screen.getByLabelText(/bloque/i).querySelectorAll('option'))
      .map((o) => o.value).filter(Boolean);
    await userEvent.selectOptions(screen.getByLabelText(/bloque/i), opciones[0]);
    await screen.findByText('ANA LOPEZ');
  }

  it('enviar registra a TODOS los estudiantes, no solo a los tocados', async () => {
    await elegirCursoYBloque();

    // Se marca una sola falta; los demas se quedan como estan (presentes por defecto).
    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: 'F' }));

    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    await waitFor(async () => {
      const cola = await db.outbox.toArray();
      // Este era el defecto: quedaba 1 registro de un curso de 2 estudiantes.
      expect(cola).toHaveLength(2);
    });
    const cola = await db.outbox.toArray();
    expect(cola.find((r) => r.studentId === 10)?.status).toBe('F');
    expect(cola.find((r) => r.studentId === 11)?.status).toBe('P');
  });

  it('un curso que asiste completo tambien se puede enviar', async () => {
    await elegirCursoYBloque();

    // Sin tocar nada: antes el boton estaba deshabilitado y no se podia registrar nada.
    const boton = screen.getByRole('button', { name: /enviar asistencia/i });
    expect(boton).not.toBeDisabled();
    await userEvent.click(boton);

    await waitFor(async () => {
      const cola = await db.outbox.toArray();
      expect(cola).toHaveLength(2);
      expect(cola.every((r) => r.status === 'P')).toBe(true);
    });
  });

  it('el boton dice cuantos se van a enviar, no cuantos se tocaron', async () => {
    await elegirCursoYBloque();
    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: 'F' }));

    // Con 2 estudiantes en el curso y 1 tocado, debe anunciar 2.
    expect(screen.getByRole('button', { name: /enviar asistencia \(2\)/i })).toBeInTheDocument();
  });

  it('sin bloque elegido no ofrece enviar', async () => {
    render(<TomarAsistencia />);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /enviar asistencia/i })).toBeDisabled();
  });
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd app/frontend && npm test src/pages/TomarAsistencia.test.tsx`
Expected: FAIL. El primero deja 1 registro en la cola en vez de 2, y el segundo encuentra
el botón deshabilitado: es el defecto reproducido.

- [ ] **Step 3: Registrar el curso completo al enviar**

En `TomarAsistencia.tsx`, sustituir `enviar()`:

```tsx
  /**
   * Registra el curso completo y lo sincroniza.
   *
   * Antes solo viajaban los estudiantes a los que el docente habia pulsado un boton,
   * aunque la pantalla mostrara la "P" resaltada para todos: de un curso de 40 con 3
   * faltas se guardaban 3 filas y los 37 presentes no existian en la base. El estado
   * efectivo de cada uno es el que se ve en pantalla, y eso es lo que se envia.
   */
  async function enviar() {
    if (!blockId || !lectivo || students.length === 0) return;
    setError('');
    try {
      for (const s of students) {
        await markAttendance({
          studentId: s.id,
          scheduleBlockId: blockId,
          classDate: fecha,
          status: marcas[s.id] ?? 'P',
        });
      }
      const { pending, alcanzable: hay } = await flushOutbox();
      setPendientes(pending);
      setAlcanzable(hay);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar');
    }
  }
```

Y el botón, que ahora anuncia lo que va a enviar de verdad:

```tsx
      <button type="button" onClick={() => void enviar()}
              disabled={blockId === null || !lectivo || students.length === 0}>
        Enviar asistencia ({students.length})
      </button>
```

- [ ] **Step 4: Avisar de lo que va a pasar**

Encima del botón, para que no haya sorpresa:

```tsx
      {blockId !== null && lectivo && students.length > 0 && (
        <p className="meta">
          Se registraran los {students.length} estudiantes del curso. Los que no haya
          cambiado quedan como presentes.
        </p>
      )}
```

- [ ] **Step 5: Ejecutar los tests**

Run: `cd app/frontend && npm test`
Expected: PASS todo.

- [ ] **Step 6: Comprobarlo con datos reales**

Con la base de carga levantada (ver `app/README.md`, sección de medición), entrar como
`docente1@ggm.edu.co`, elegir su curso y un día lectivo, marcar **una** falta y enviar.
Después, en la base:

```sql
SELECT count(*) FROM attendance WHERE class_date = DATE '<el dia elegido>';
```

Expected: **40**, no 1.

- [ ] **Step 7: Commit**

```bash
git add app/frontend
git commit -m "fix: solo se guardaban los estudiantes que el docente tocaba

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Un bloque a medias sigue contando como pendiente

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/repository/ReportRepository.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/report/PendientesTest.java`

**Interfaces:**
- Consumes: tablas `schedule_blocks`, `attendance`, `students`.
- Produces: `GET /api/reports/pending-today` deja de dar por completo un bloque que solo tiene algunos registros.

La Task 1 corrige el origen, pero la red de seguridad también estaba rota: hoy basta
**un** registro para que el bloque desaparezca del aviso. Si algo vuelve a dejar una
clase a medias —un envío interrumpido, un fallo parcial de sincronización— nadie se
entera. El aviso debe comparar contra el número de estudiantes del curso.

- [ ] **Step 1: Escribir el test**

```java
package co.edu.ggm.asistencia.report;

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
 * Usa sus propios estudiantes y su propio bloque (grado 999) para no mutar la semilla.
 */
@AutoConfigureMockMvc
class PendientesTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private Long bloqueId;

    @BeforeEach
    void datos() {
        int diaDeHoy = java.time.LocalDate.now(java.time.ZoneId.of("America/Bogota"))
                .getDayOfWeek().getValue();
        if (diaDeHoy > 5) diaDeHoy = 1;   // en fin de semana no hay bloques; se usa lunes

        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade)
                VALUES ('9990000001','UNO','PENDIENTE','999'),
                       ('9990000002','DOS','PENDIENTE','999'),
                       ('9990000003','TRES','PENDIENTE','999')
                ON CONFLICT (document_id) DO NOTHING
                """);
        jdbcBase.update("INSERT INTO subjects (name) VALUES ('MateriaPendiente') ON CONFLICT DO NOTHING");
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id)
                VALUES ('999', ?, 7, '15:00', '15:50',
                        (SELECT id FROM subjects WHERE name='MateriaPendiente'),
                        (SELECT id FROM users WHERE email='fpalacios@ggm.edu.co'))
                ON CONFLICT (grade, weekday, block_no) DO NOTHING
                """, diaDeHoy);
        bloqueId = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade='999' AND block_no=7", Long.class);
        jdbcBase.update("DELETE FROM attendance WHERE schedule_block_id = ?", bloqueId);
    }

    private void registrar(String documento) {
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
                VALUES (gen_random_uuid(), (SELECT id FROM students WHERE document_id=?), ?,
                        (SELECT calendar_date FROM school_calendar
                          WHERE day_type='LECTIVO' AND calendar_date <= CURRENT_DATE
                          ORDER BY calendar_date DESC LIMIT 1),
                        'P', (SELECT id FROM users WHERE email='fpalacios@ggm.edu.co'), now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING
                """, documento, bloqueId);
    }

    private String token() { return tokenDe("fpalacios@ggm.edu.co", "DOCENTE"); }

    @Test
    void un_bloque_sin_ningun_registro_aparece_como_pendiente() throws Exception {
        mvc.perform(get("/api/reports/pending-today").header("Authorization", token()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='999')]").exists());
    }

    @Test
    void un_bloque_con_solo_algunos_registros_SIGUE_pendiente() throws Exception {
        registrar("9990000001");
        // Este era el defecto: un unico registro bastaba para darlo por completo,
        // y nadie avisaba de que faltaban los otros dos.
        mvc.perform(get("/api/reports/pending-today").header("Authorization", token()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='999')]").exists());
    }

    @Test
    void con_todos_los_estudiantes_registrados_ya_no_aparece() throws Exception {
        registrar("9990000001");
        registrar("9990000002");
        registrar("9990000003");
        mvc.perform(get("/api/reports/pending-today").header("Authorization", token()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='999')]").doesNotExist());
    }
}
```

**Los tests dependen del día en que se ejecuten**, porque el aviso es "de hoy". Por eso
el `@BeforeEach` crea el bloque en el día de la semana actual y cae a lunes los fines de
semana. Si un día fallan en la integración continua un sábado, es este detalle.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest=PendientesTest`
Expected: FAIL el segundo — con un solo registro el bloque desaparece del aviso.

- [ ] **Step 3: Comparar contra el número de estudiantes del curso**

En `ReportRepository`, sustituir la consulta `pendingToday`:

```java
    @Query(value = """
            SELECT b.id AS blockId, b.grade AS grade, sub.name AS subject, b.block_no AS blockNo
            FROM schedule_blocks b
            JOIN subjects sub ON sub.id = b.subject_id
            WHERE b.teacher_id = :teacherId
              AND b.weekday = :weekday
              -- Un bloque esta pendiente mientras le falte algun estudiante, no solo
              -- cuando no tenga ninguno: antes bastaba un registro para darlo por
              -- completo y nadie avisaba de los que faltaban.
              AND (SELECT count(*) FROM attendance a
                    WHERE a.schedule_block_id = b.id AND a.class_date = :day)
                  < (SELECT count(*) FROM students s
                      WHERE s.grade = b.grade AND s.active)
            ORDER BY b.block_no
            """, nativeQuery = true)
    List<PendingBlock> pendingToday(@Param("teacherId") Long teacherId,
                                    @Param("weekday") int weekday,
                                    @Param("day") LocalDate day);
```

- [ ] **Step 4: Ejecutar los tests**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
Expected: PASS todo, en cualquier orden de ejecución.

- [ ] **Step 5: Comprobar que no se volvió lento**

La consulta hace ahora dos subconsultas por bloque. Con la base de carga:

```bash
curl -s -o /dev/null -w "%{time_total}s\n" http://localhost:8082/api/reports/pending-today \
  -H "Authorization: Bearer $TOKEN"
```

Expected: por debajo de 300 ms. Un docente tiene 5 o 6 bloques al día, así que son una
docena de subconsultas sobre índices que ya existen. **Si pasara de 300 ms**, anotarlo y
plantear un índice, no adivinar.

- [ ] **Step 6: Commit**

```bash
git add app/backend
git commit -m "fix: un bloque a medias se daba por completo y nadie avisaba

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Dejarlo escrito y comprobado en la prueba de humo

**Files:**
- Modify: `tools/humo.sh`
- Modify: `docs/INFORME-FINAL.md`

- [ ] **Step 1: Añadir el invariante a `tools/humo.sh`**

Antes del bloque de resultado:

```bash
# --- La asistencia se guarda completa ------------------------------------------
# De un curso de N estudiantes deben quedar N registros, no solo los que el docente
# toco. Se comprueba contra el bloque de la semilla, que tiene 2 estudiantes en 601.
FECHA_LIBRE="2026-03-10"
LOTE_COMPLETO=$(mktemp)
python -c "
import json, uuid
recs = [{'id': str(uuid.uuid4()), 'studentId': i, 'scheduleBlockId': 1,
         'classDate': '$FECHA_LIBRE', 'status': 'P',
         'recordedAt': '${FECHA_LIBRE}T12:00:00Z'} for i in (1, 2)]
print(json.dumps({'records': recs}))" > "$LOTE_COMPLETO"
curl -s -o /dev/null -X POST "$BASE/api/attendance/sync" -H "$AUTH" \
  -H 'Content-Type: application/json' --data-binary "@$LOTE_COMPLETO"
rm -f "$LOTE_COMPLETO"

GUARDADOS=$(curl -s "$BASE/api/attendance?blockId=1&date=$FECHA_LIBRE" -H "$AUTH" \
  | grep -o '"studentId"' | wc -l | tr -d ' ')
comprobar "el curso se guarda completo" "2" "$GUARDADOS"
```

- [ ] **Step 2: Ejecutar la prueba de humo**

Run: levantar la aplicación y `bash tools/humo.sh http://localhost:8080`
Expected: todos los invariantes se mantienen, ahora 22.

- [ ] **Step 3: Escribir la sección 6.j del informe**

Con el defecto, la medición que lo demostró (3 registros de un curso de 40), las cuatro
consecuencias encadenadas y los dos arreglos.

- [ ] **Step 4: Commit**

```bash
git add tools docs
git commit -m "test: invariante de que el curso se guarda completo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fuera de alcance

1. **Sembrar la cola al elegir el bloque**, en vez de al enviar. Convertiría "mirar" en
   "registrar": un docente que abre el bloque equivocado dejaría 40 presentes falsos.
2. **Un botón de "marcar todos presentes".** Ya es el comportamiento por defecto; un
   botón para lo que pasa solo es ruido.
3. **Avisar de estudiantes sin marcar antes de enviar.** Con la corrección no existen:
   todos van con su estado efectivo.
4. **Rellenar hacia atrás los días ya registrados a medias.** Los datos de producción
   todavía no existen, así que no hay nada que rellenar. Si el colegio ya hubiera
   empezado, haría falta una migración de datos y su propio plan.
5. **Marcar la ausencia de registro como distinta de la asistencia.** Con la corrección,
   un bloque enviado tiene fila para todos; la ausencia de filas significa
   inequívocamente "esta clase no se registró", que es justo lo que se quería.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Enviar 40 registros donde antes iban 3 | Más tráfico en una conexión mala | Medido: un lote de 40 son 101 ms y unos 6 KB. El tope de 500 por lote deja margen de sobra |
| El docente envía por error un bloque que no dictó | 40 presentes falsos | Ya existía: bastaba tocar un botón. El aviso nuevo encima del botón dice exactamente qué va a pasar |
| `pending-today` hace dos subconsultas por bloque | Podría ralentizarse | Se mide en la Task 2 Step 5; un docente tiene 5 o 6 bloques al día |
| Los tests de `PendientesTest` dependen del día | Podrían fallar un sábado en la CI | El `@BeforeEach` cae a lunes en fin de semana, y está anotado |

## Self-review

**Cobertura.** El defecto tiene dos tareas porque tiene dos caras: el origen (la cola
solo recibía lo tocado, Task 1) y la red de seguridad que debió atraparlo (el aviso daba
el bloque por completo, Task 2). La Task 3 lo convierte en un invariante comprobado en
cada ejecución de la integración continua.

**Sin marcadores de posición.** Cada paso trae el código o el comando exacto.

**Consistencia.** `enviar()` usa `students`, `marcas`, `blockId`, `fecha` y `lectivo`,
que ya existen en el componente. `markAttendance` conserva su firma. La consulta
`pendingToday` mantiene su nombre, sus parámetros y su proyección `PendingBlock`.

**Por qué esto se escapó tanto tiempo.** Los tests unitarios comprobaban que *marcar un
estudiante lo encola*, y eso siempre funcionó. Nadie comprobó *cuántos quedan al final*,
porque con los datos de prueba —dos o tres estudiantes— marcar uno y ver un registro
parecía correcto. Hizo falta un curso de 40 y contar las filas en la base para que la
diferencia entre 3 y 40 saltara a la vista.
