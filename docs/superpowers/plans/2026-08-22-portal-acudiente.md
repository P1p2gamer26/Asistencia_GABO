# El Portal del Acudiente Debe Decir la Verdad — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un acudiente distinga "a mi hijo le fue bien" de "nadie registró nada", y que pueda ver el periodo que le importa.

**Architecture:** El endpoint del portal devuelve además cuántos días lectivos tuvo el periodo y en cuántos hay registro de ese estudiante. Con esos dos números la pantalla puede decir la verdad en vez de un "0 novedades" ambiguo, y se le da al acudiente un selector de periodo en lugar de una ventana fija de 30 días.

**Tech Stack:** Java 21, Spring Boot 3.4, PostgreSQL 16, React 18, TypeScript, Vitest.

**Spec:** Verificación del 22 de agosto de 2026 contra la base de carga, registrada en la sección 6.m de `docs/INFORME-FINAL.md`.

## El defecto, medido

Un acudiente real de la base de carga, consultado hoy:

```json
[{"studentId":777,"fullName":"NOMBRE774 ...","grade":"1004","recent":[]}]
```

Pantalla vacía. Pero en la base, ese mismo hijo tiene:

```
registros del hijo: 516 | faltas: 22
```

Dos problemas distintos, y el segundo es el grave.

**1. La ventana es fija de 30 días.** El portal mira siempre los últimos 30 días. En
agosto, tras el receso de mitad de año, el acudiente no ve nada de un semestre entero de
historial. No hay forma de mirar más atrás.

**2. "0 novedades" significa dos cosas opuestas.** La pantalla dice literalmente
*"0 novedad(es) en los ultimos 30 dias"*, y un padre lo lee como **"a mi hijo le fue
bien"**. Pero exactamente el mismo mensaje aparece cuando **nadie tomó asistencia**. El
portal le está prometiendo una tranquilidad que no puede respaldar.

Esto va justo en contra del objetivo del proyecto tal como está escrito en el documento
de contexto: *"debe ayudar a los padres a conocer la situación de su hijo en el
colegio"*. Decirle "todo bien" cuando no se sabe nada es peor que no decirle nada.

## Global Constraints

- **El proyecto vive en `app/`**: `app/backend`, `app/frontend`.
- **MVC clásico por capas** en el backend (`app/README.md`): el sufijo de la clase decide su paquete.
- **PostgreSQL 16 local.** Backend: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
- **Un acudiente solo puede ver a sus propios hijos.** La consulta parte de `guardianships` filtrando por el usuario del token y **no acepta ningún `studentId` por parámetro**: un parámetro es una invitación a cambiarlo a mano.
- **Ningún test puede mutar los datos de la semilla.** La CI corre con `-Dsurefire.runOrder=random`.
- **`waitFor`, nunca `findByRole`,** para contenido que depende de un efecto asíncrono.
- **Sin dependencias nuevas.** El paquete de producción sigue por debajo de 200 KB gzip.
- **Idioma:** identificadores en inglés, texto visible en español. Sin tildes ni letra eñe en nombres de ficheros, tablas ni campos JSON.
- **Commits:** Conventional Commits en español, terminando con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
app/backend/src/main/java/co/edu/ggm/asistencia/
├── controller/GuardianController.java     (modificar) periodo y cobertura
└── repository/StudentRepository.java      (modificar) dias con registro
app/backend/src/test/java/co/edu/ggm/asistencia/student/
└── GuardianTest.java                      (modificar) casos nuevos
app/frontend/src/
├── pages/Padre.tsx                        (modificar) tres estados y selector
├── pages/Padre.test.tsx                   (modificar) casos nuevos
└── api/contract.ts                        (modificar) campos nuevos
```

---

## Task 1: El endpoint dice cuánto se registró, no solo qué pasó

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/repository/StudentRepository.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/GuardianController.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/student/GuardianTest.java`

**Interfaces:**
- Consumes: `guardianships`, `attendance`, `school_calendar`.
- Produces: `GET /api/guardian/children?from=&to=` (ambos opcionales; por defecto los últimos 60 días) ->
  `[{studentId, fullName, grade, schoolDays, recordedDays, recent: [{classDate, subject, status, comment}]}]`

**`schoolDays`** son los días lectivos del periodo. **`recordedDays`** son aquellos en que
ese estudiante tiene al menos un registro. Con los dos, la pantalla puede distinguir lo
que hoy confunde.

El valor por defecto pasa de 30 a **60 días**, que cubre un bimestre escolar completo. No
más, porque el portal es para el seguimiento cercano; para el histórico está el informe
que pide coordinación.

- [ ] **Step 1: Escribir los tests**

Añadir a `GuardianTest.java`. Usan su propio estudiante y acudiente para no mutar la
semilla.

```java
    @Test
    void informa_de_cuantos_dias_lectivos_tiene_el_periodo() throws Exception {
        mvc.perform(get("/api/guardian/children")
                        .param("from", "2026-03-02").param("to", "2026-03-06")
                        .header("Authorization", "Bearer " + jwt.issueAccess(acudienteId, "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].schoolDays").value(5));
    }

    @Test
    void sin_ningun_registro_lo_dice_en_vez_de_fingir_que_todo_fue_bien() throws Exception {
        jdbcBase.update("DELETE FROM attendance WHERE student_id = ?", hijoId);
        mvc.perform(get("/api/guardian/children")
                        .param("from", "2026-03-02").param("to", "2026-03-06")
                        .header("Authorization", "Bearer " + jwt.issueAccess(acudienteId, "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].schoolDays").value(5))
           // Cero dias con registro: la pantalla NO puede decir "todo bien".
           .andExpect(jsonPath("$[0].recordedDays").value(0));
    }

    @Test
    void cuenta_los_dias_en_que_si_hay_registro() throws Exception {
        jdbcBase.update("DELETE FROM attendance WHERE student_id = ?", hijoId);
        registrarAsistencia("2026-03-02", "P");
        registrarAsistencia("2026-03-03", "F");
        mvc.perform(get("/api/guardian/children")
                        .param("from", "2026-03-02").param("to", "2026-03-06")
                        .header("Authorization", "Bearer " + jwt.issueAccess(acudienteId, "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].recordedDays").value(2));
    }

    @Test
    void sin_fechas_usa_los_ultimos_sesenta_dias() throws Exception {
        mvc.perform(get("/api/guardian/children")
                        .header("Authorization", "Bearer " + jwt.issueAccess(acudienteId, "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].schoolDays").isNumber());
    }
```

Y el ayudante, junto a los que ya existen en la clase:

```java
    private void registrarAsistencia(String fecha, String estado) {
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, recorded_by, recorded_at)
                VALUES (gen_random_uuid(), ?, (SELECT id FROM schedule_blocks LIMIT 1),
                        ?::date, ?, (SELECT id FROM users WHERE email = 'fpalacios@ggm.edu.co'), now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot DO UPDATE SET status = EXCLUDED.status
                """, hijoId, fecha, estado);
    }
```

Si `hijoId` y `acudienteId` no son campos de la clase, extraerlos en el `@BeforeEach`
que ya prepara los datos.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest=GuardianTest`
Expected: FAIL — `schoolDays` y `recordedDays` no existen en la respuesta.

- [ ] **Step 3: Contar los días con registro en `StudentRepository`**

```java
    @org.springframework.data.jpa.repository.Query(value = """
            SELECT count(DISTINCT a.class_date)
            FROM attendance a
            WHERE a.student_id = :studentId AND a.class_date BETWEEN :from AND :to
            """, nativeQuery = true)
    int countRecordedDays(@org.springframework.data.repository.query.Param("studentId") Long studentId,
                          @org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
                          @org.springframework.data.repository.query.Param("to") java.time.LocalDate to);
```

- [ ] **Step 4: Ampliar `GuardianController`**

```java
    public record Child(Long studentId, String fullName, String grade,
                        int schoolDays, int recordedDays, List<Mark> recent) {}

    @GetMapping("/children")
    public List<Child> children(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        // Por defecto, un bimestre: el portal es para el seguimiento cercano. Para el
        // historico completo esta el informe que descarga coordinacion.
        LocalDate hasta = to != null ? to : LocalDate.now(BOGOTA);
        LocalDate desde = from != null ? from : hasta.minusDays(60);

        int lectivos = calendar.countSchoolDays(desde, hasta);

        Map<Long, String> materias = schedules.findAll().stream()
                .collect(Collectors.toMap(b -> b.getId(), b -> b.getSubject().getName(), (a, b) -> a));

        return students.findChildren(JwtService.currentUserId()).stream()
                .map(c -> new Child(
                        c.getStudentId(), c.getFullName(), c.getGrade(),
                        lectivos,
                        students.countRecordedDays(c.getStudentId(), desde, hasta),
                        students.recentAttendance(c.getStudentId(), desde, hasta).stream()
                                .map(a -> new Mark(a.getClassDate(),
                                        materias.getOrDefault(a.getScheduleBlockId(), "Clase"),
                                        a.getStatus(), a.getComment()))
                                .toList()))
                .toList();
    }
```

Inyectar `CalendarService calendar` en el constructor. Si `CalendarService` no tiene
`countSchoolDays`, usar el `ReportRepository.countSchoolDays` que ya existe, o añadirlo
al servicio de calendario; **no duplicar la consulta**.

- [ ] **Step 5: Ejecutar los tests**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
Expected: PASS todo, en cualquier orden.

- [ ] **Step 6: Commit**

```bash
git add app/backend
git commit -m "feat: el portal del acudiente informa de cuanto se registro

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: La pantalla dice cuál de los tres casos es

**Files:**
- Modify: `app/frontend/src/api/contract.ts`
- Modify: `app/frontend/src/pages/Padre.tsx`
- Test: `app/frontend/src/pages/Padre.test.tsx`

**Interfaces:**
- Consumes: `GET /api/guardian/children?from=&to=` (Task 1).
- Produces: nada nuevo.

**Los tres estados**, que hoy se muestran todos igual:

| Situación | Qué dice hoy | Qué debe decir |
|---|---|---|
| Hay novedades | "N novedad(es)" | La lista, como ahora |
| Se registró y no hubo novedades | "0 novedad(es)" | "Asistió a las N clases registradas" |
| **No se registró nada** | "0 novedad(es)" | "Todavía no hay registros de este periodo" |

El tercero es el que importa: hoy un padre lee "0 novedades" y entiende que a su hijo le
fue bien, cuando puede que nadie haya tomado asistencia.

- [ ] **Step 1: Ampliar el contrato**

En `app/frontend/src/api/contract.ts`, en el tipo del hijo:

```ts
  schoolDays: number;
  recordedDays: number;
```

- [ ] **Step 2: Escribir los tests**

Añadir a `Padre.test.tsx`:

```tsx
  it('sin ningun registro lo dice, en vez de dar a entender que todo fue bien', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([{
      studentId: 2, fullName: 'JUAN AVILA', grade: '601',
      schoolDays: 12, recordedDays: 0, recent: [],
    }])));
    render(<Padre />);
    await waitFor(() =>
      expect(screen.getByText(/todavia no hay registros/i)).toBeInTheDocument());
    expect(screen.queryByText(/0 novedad/i)).not.toBeInTheDocument();
  });

  it('con registros y sin novedades tranquiliza con fundamento', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([{
      studentId: 2, fullName: 'JUAN AVILA', grade: '601',
      schoolDays: 12, recordedDays: 12, recent: [],
    }])));
    render(<Padre />);
    await waitFor(() =>
      expect(screen.getByText(/asistio a las 12 clases registradas/i)).toBeInTheDocument());
  });

  it('con registros parciales dice cuantos dias cubre', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([{
      studentId: 2, fullName: 'JUAN AVILA', grade: '601',
      schoolDays: 12, recordedDays: 5, recent: [],
    }])));
    render(<Padre />);
    await waitFor(() =>
      expect(screen.getByText(/5 de 12/i)).toBeInTheDocument());
  });

  it('con novedades las lista, como antes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([{
      studentId: 2, fullName: 'JUAN AVILA', grade: '601',
      schoolDays: 12, recordedDays: 12,
      recent: [{ classDate: '2026-08-20', subject: 'Matematicas', status: 'F' }],
    }])));
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/No asistio/i)).toBeInTheDocument());
  });
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd app/frontend && npm test src/pages/Padre.test.tsx`
Expected: FAIL — la pantalla sigue diciendo "0 novedad(es)".

- [ ] **Step 4: Distinguir los tres casos en `Padre.tsx`**

Sustituir la línea del resumen:

```tsx
        const novedades = h.recent.filter((m) => m.status !== 'P');
        const resumen =
          h.recordedDays === 0
            // Un padre lee "0 novedades" como "le fue bien". Si nadie tomo asistencia,
            // eso seria prometerle una tranquilidad que el sistema no puede respaldar.
            ? 'Todavia no hay registros de este periodo.'
            : novedades.length > 0
              ? `${novedades.length} novedad(es) en ${h.recordedDays} de ${h.schoolDays} dias registrados.`
              : h.recordedDays >= h.schoolDays
                ? `Asistio a las ${h.recordedDays} clases registradas, sin novedades.`
                : `Sin novedades en ${h.recordedDays} de ${h.schoolDays} dias registrados.`;
```

y usarlo:

```tsx
            <p className="meta">{resumen}</p>
```

- [ ] **Step 5: Ejecutar los tests**

Run: `cd app/frontend && npm test && npm run build`
Expected: PASS todo, paquete por debajo de 200 KB gzip.

- [ ] **Step 6: Comprobarlo con datos reales**

Con la base de carga levantada:

```bash
G=$(curl -s -X POST http://localhost:8082/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"acudiente777@correo.com","password":"cambiar123"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s "http://localhost:8082/api/guardian/children?from=2026-03-01&to=2026-03-31" \
  -H "Authorization: Bearer $G"
```

Expected: `schoolDays` y `recordedDays` con valores reales, y `recent` con las novedades
de marzo. Antes, ese mismo acudiente veía una pantalla vacía pese a tener 516 registros
y 22 faltas en el semestre.

- [ ] **Step 7: Commit**

```bash
git add app/frontend
git commit -m "fix: '0 novedades' significaba tanto 'todo bien' como 'nadie registro'

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fuera de alcance

1. **Un selector de periodo en la pantalla del acudiente.** El endpoint ya acepta fechas
   y el valor por defecto pasa a 60 días, que cubre un bimestre. Un selector de rangos es
   una pantalla más para un usuario que entra a mirar si hay novedades, no a analizar.
2. **Notificar al acudiente cuando aparece una novedad.** Ya existe la cola de
   notificaciones por correo; duplicarlo en la pantalla sería ruido.
3. **Mostrarle al padre el porcentaje de asistencia.** Un número agregado invita a
   comparaciones que el colegio no ha pedido; las novedades concretas son más útiles y
   menos susceptibles de malinterpretarse.
4. **Histórico completo del año.** Para eso está el informe en Excel que pide
   coordinación, que ya funciona y se verificó contra la base.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `countRecordedDays` es una consulta más por hijo | Latencia en el portal | Un acudiente tiene uno o dos hijos; la consulta va sobre `idx_attendance_student_date`, que ya existe |
| Ampliar a 60 días trae más registros | Respuesta mayor | Medido antes: el portal respondía en 32 ms; solo se listan las novedades, no los presentes |
| "Todavia no hay registros" puede alarmar | Un padre llama al colegio | Es la verdad, y es preferible a que crea que todo va bien cuando nadie sabe |

## Self-review

**Cobertura.** Los dos problemas medidos tienen tarea: la ventana fija de 30 días (Task 1,
pasa a 60 y acepta fechas) y el "0 novedades" ambiguo (Task 2, tres estados distintos).

**Sin marcadores de posición.** Cada paso trae el código o el comando exacto.

**Consistencia.** `Child` gana `schoolDays` y `recordedDays` en el controlador, en
`contract.ts` y en los tests de las dos tareas. `countRecordedDays(studentId, from, to)`
se declara en la Task 1 Step 3 y se usa en el Step 4. El endpoint sigue sin aceptar
`studentId`: la lista parte de `findChildren(JwtService.currentUserId())`.

**El hilo que conecta este defecto con los anteriores.** Es el cuarto de la misma
familia: la pantalla afirmaba algo que el sistema no sabía. La asistencia que se guardaba
a medias, la clase que se mostraba en blanco, la portería que no reconocía a nadie, y
ahora un "0 novedades" que significaba tanto "todo bien" como "nadie miró". **El patrón
no es de código, es de diseño**: cada vez que una pantalla resume, hay que preguntarse
qué pasa cuando el dato de origen no existe.
