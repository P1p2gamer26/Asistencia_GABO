# Producción v2 — Carnet real, informes Excel y despliegue Vercel + Supabase + Fly

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el colegio pueda usar el sistema desde internet, leyendo los carnets
reales y descargando los tres informes en Excel que pidió coordinación.

**Architecture:** Se conserva íntegro el backend Spring Boot ya verificado. El
frontend se separa del backend y pasa a Vercel, hablando con la API por una URL base
configurable; la base de datos se muda a Supabase (mismo PostgreSQL 16, mismas
migraciones Flyway); el backend se despliega en Fly.io. El carnet se parsea con una
función pura probada en los dos lados —navegador y servidor— porque la cola offline
puede llevar texto crudo. Los informes se añaden como tipos del endpoint Excel que ya
existe, sin endpoints nuevos.

**Tech Stack:** Java 21 · Spring Boot 3 · PostgreSQL 16 (Supabase) · Flyway · Apache
POI (SXSSF) · React 18 · TypeScript · Vite · Dexie/IndexedDB · Vitest ·
Testing Library · Vercel · Fly.io

**Spec:** `docs/superpowers/plans/2026-08-21-v2-produccion-spec.md`

## Global Constraints

- **No romper `tools/humo.sh`.** Sus 15 invariantes se ejecutan en CI contra la
  imagen empaquetada. Si un cambio los rompe, el cambio está mal, no la prueba.
- **`/api/reports/excel` sin el parámetro `tipo` sigue devolviendo el informe de
  resumen actual, con las mismas 9 columnas.** `humo.sh` lo comprueba.
- **La base de datos manda sobre el carnet.** Nunca se crea ni se modifica un
  estudiante a partir del texto de un QR.
- **Ningún endpoint acepta `studentId` del cliente para datos de acudiente.** La
  identidad sale siempre del JWT (`JwtService.currentUserId()`).
- **Java 21, Node 22.** Sin dependencias nuevas en ningún lado: todo lo que hace
  falta ya está instalado (POI, Dexie, React Router).
- **Sin acentos ni eñes en el código fuente Java y en los mensajes de commit**, igual
  que en todo el repositorio existente. En los textos de la interfaz y en los
  documentos sí se escriben normal.
- **Zona horaria `America/Bogota`** para toda fecha derivada de un instante.
- Los tests del backend corren con `TEST_DB_URL` apuntando a una base propia:
  `mvn -B verify -Dsurefire.runOrder=random` en `app/backend`.
- Los tests del frontend: `npm test` en `app/frontend`.

---

### Task 1: Parseo del texto del carnet

El QR trae `Álvaro Mathias Orozco Lara 1013696566 Primero - 103`. Hace falta una
función pura que saque el documento y deje aparte el nombre y el curso para poder
avisar de discrepancias. Pura y sin dependencias: se usa en el navegador y su lógica
se replica en el servidor en la Task 3.

**Files:**
- Create: `app/frontend/src/scan/carnet.ts`
- Test: `app/frontend/src/scan/carnet.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `export type Carnet = { documentId: string; nombre: string; curso: string }`
  y `export function parseCarnet(raw: string): Carnet | null`.

- [x] **Step 1: Write the failing test**

Crear `app/frontend/src/scan/carnet.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCarnet } from './carnet';

describe('parseCarnet', () => {
  it('saca documento, nombre y curso del carnet real', () => {
    expect(parseCarnet('Álvaro Mathias Orozco Lara 1013696566 Primero - 103')).toEqual({
      documentId: '1013696566',
      nombre: 'Álvaro Mathias Orozco Lara',
      curso: 'Primero - 103',
    });
  });

  it('acepta un QR que solo trae el numero', () => {
    expect(parseCarnet('1013696566')).toEqual({
      documentId: '1013696566',
      nombre: '',
      curso: '',
    });
  });

  it('normaliza espacios y saltos de linea del carnet', () => {
    expect(parseCarnet('  Ana\n Lopez \t1002003004\n 601 ')).toEqual({
      documentId: '1002003004',
      nombre: 'Ana Lopez',
      curso: '601',
    });
  });

  it('toma el primer numero largo cuando el curso tambien tiene digitos', () => {
    // "103" no debe ganarle a "1013696566": el documento es el primero de 6 a 12 digitos
    expect(parseCarnet('Orozco Lara 1013696566 Primero - 103')!.documentId)
      .toBe('1013696566');
  });

  it('ignora numeros cortos que no son documento', () => {
    expect(parseCarnet('Juan Perez 601')).toBeNull();
  });

  it('devuelve null con texto vacio o sin numeros', () => {
    expect(parseCarnet('')).toBeNull();
    expect(parseCarnet('carnet ilegible')).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd app/frontend && npx vitest run src/scan/carnet.test.ts`
Expected: FAIL — `Failed to resolve import "./carnet"`.

- [x] **Step 3: Write minimal implementation**

Crear `app/frontend/src/scan/carnet.ts`:

```ts
export type Carnet = { documentId: string; nombre: string; curso: string };

/**
 * Texto impreso en el carnet: "Alvaro Mathias Orozco Lara 1013696566 Primero - 103".
 * El documento es el primer numero de 6 a 12 digitos; lo de antes es el nombre y lo
 * de despues el curso. Los dos ultimos son informativos: manda la base de datos.
 */
export function parseCarnet(raw: string): Carnet | null {
  const texto = raw.replace(/\s+/g, ' ').trim();
  const m = texto.match(/\b(\d{6,12})\b/);
  if (!m) return null;
  return {
    documentId: m[1],
    nombre: texto.slice(0, m.index).trim(),
    curso: texto.slice(m.index! + m[1].length).trim(),
  };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd app/frontend && npx vitest run src/scan/carnet.test.ts`
Expected: PASS, 6 tests.

- [x] **Step 5: Commit**

```bash
git add app/frontend/src/scan/carnet.ts app/frontend/src/scan/carnet.test.ts
git commit -m "feat: leer el texto completo del carnet, no solo el numero"
```

---

### Task 2: La pantalla de escaneo usa el parser y avisa discrepancias

Hoy `Ingreso.tsx` manda el texto crudo del QR como `documentId`, así que con el
carnet real todos los escaneos serían rechazados. Además, si el carnet dice un curso
distinto del que tiene la base, la docente tiene que enterarse.

**Files:**
- Modify: `app/frontend/src/pages/Ingreso.tsx`
- Test: `app/frontend/src/pages/Ingreso.test.tsx` (crear)

**Interfaces:**
- Consumes: `parseCarnet` de Task 1; `db.students` (campos `documentId`, `fullName`,
  `grade`) y `db.entryOutbox` de `src/db/local.ts`; `api.post` de `src/api/client.ts`.
- Produces: nada para otras tareas.

- [x] **Step 1: Write the failing test**

Crear `app/frontend/src/pages/Ingreso.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { db } from '../db/local';
import Ingreso from './Ingreso';

// La camara no existe en jsdom: se simula el modulo de escaneo entero.
const siguienteCodigo = vi.hoisted(() => ({ valor: '' }));
vi.mock('../scan/scanner', () => ({
  abrirCamara: vi.fn(async () => ({ getTracks: () => [] }) as unknown as MediaStream),
  scanOnce: vi.fn(async () => {
    if (!siguienteCodigo.valor) await new Promise(() => {});   // se queda esperando
    const v = siguienteCodigo.valor;
    siguienteCodigo.valor = '';
    return v;
  }),
}));
vi.mock('../api/client', () => ({
  api: { post: vi.fn(async () => ({ accepted: 1, rejected: [] })) },
  OfflineError: class extends Error {},
}));

beforeEach(async () => {
  await db.students.clear();
  await db.entryOutbox.clear();
  await db.students.put({ id: 1, documentId: '1013696566', fullName: 'Alvaro Orozco Lara', grade: '103' });
});

describe('Ingreso', () => {
  it('encola el documento extraido del carnet, no el texto completo', async () => {
    siguienteCodigo.valor = 'Alvaro Mathias Orozco Lara 1013696566 Primero - 103';
    render(<Ingreso />);
    await waitFor(async () =>
      expect((await db.entryOutbox.toArray())[0]?.documentId).toBe('1013696566'));
  });

  it('muestra el nombre que tiene la base de datos', async () => {
    siguienteCodigo.valor = 'Alvaro Mathias Orozco Lara 1013696566 Primero - 103';
    render(<Ingreso />);
    expect(await screen.findByText(/Alvaro Orozco Lara/)).toBeInTheDocument();
  });

  it('avisa si el curso del carnet no coincide con el de la base', async () => {
    siguienteCodigo.valor = 'Alvaro Mathias Orozco Lara 1013696566 Segundo - 204';
    render(<Ingreso />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/carnet dice.*204.*base.*103/i);
  });

  it('avisa cuando el QR no trae ningun documento', async () => {
    siguienteCodigo.valor = 'carnet borroso';
    render(<Ingreso />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo leer/i);
    expect(await db.entryOutbox.count()).toBe(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd app/frontend && npx vitest run src/pages/Ingreso.test.tsx`
Expected: FAIL — el primer test guarda el texto completo como `documentId`.

- [x] **Step 3: Write minimal implementation**

En `app/frontend/src/pages/Ingreso.tsx`, añadir el import:

```tsx
import { parseCarnet } from '../scan/carnet';
```

y reemplazar la función `registrar` entera por:

```tsx
  async function registrar(textoQr: string) {
    const carnet = parseCarnet(textoQr);
    if (!carnet) {
      setError('No se pudo leer el carnet. Intente de nuevo, mas cerca y con mas luz.');
      return;
    }
    setError('');
    const estudiante = await db.students.where('documentId').equals(carnet.documentId).first();
    if (!estudiante) {
      setUltimo(`Carnet ${carnet.documentId} no reconocido`);
    } else {
      setUltimo(estudiante.fullName);
      // El carnet puede estar desactualizado (traslado de curso, reimpresion vieja).
      // Se registra igual -manda la base- pero la docente tiene que verlo.
      if (carnet.curso && !carnet.curso.includes(estudiante.grade)) {
        setError(`Revisar: el carnet dice "${carnet.curso}" y la base dice "${estudiante.grade}".`);
      }
    }
    await db.entryOutbox.put({
      id: crypto.randomUUID(),
      documentId: carnet.documentId,
      scannedAt: new Date().toISOString(),
    });
    await enviar();
  }
```

En el bloque `catch` del `useEffect`, cambiar `setError('No se pudo abrir la camara...')`
para que no pise el aviso de discrepancia:

```tsx
      } catch (e) {
        if (!control.signal.aborted) setError('No se pudo abrir la camara. Revise los permisos.');
      }
```

(queda igual; se deja constancia de que se revisó y no hace falta tocarlo).

- [x] **Step 4: Run test to verify it passes**

Run: `cd app/frontend && npx vitest run src/pages/Ingreso.test.tsx`
Expected: PASS, 4 tests.

- [x] **Step 5: Run the whole frontend suite and build**

Run: `cd app/frontend && npm test && npm run build`
Expected: 50 tests previos + 6 de Task 1 + 4 nuevos = 60 en verde; build limpio y el
chunk principal por debajo de 200 KB gzip. Anotar la cifra exacta en el commit.

- [x] **Step 6: Commit**

```bash
git add app/frontend/src/pages/Ingreso.tsx app/frontend/src/pages/Ingreso.test.tsx
git commit -m "feat: la pantalla de escaneo lee el carnet real y avisa si el curso no coincide"
```

---

### Task 3: El servidor también tolera el texto crudo del carnet

La cola offline (`entryOutbox`) puede llevar semanas de escaneos hechos con la
versión anterior, con el texto completo guardado como `documentId`. Si solo se
arregla el navegador, esos quedan rechazados para siempre. El arreglo va donde pasan
todos: en `EntryController.sync`.

**Files:**
- Create: `app/backend/src/main/java/co/edu/ggm/asistencia/service/CarnetParser.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/EntryController.java:53-56`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/entry/EntryTest.java` (añadir casos)

**Interfaces:**
- Consumes: `StudentRepository.findByDocumentIdAndActiveTrue(String)`.
- Produces: `CarnetParser.documento(String raw)` → `String` o `null`.

- [x] **Step 1: Write the failing test**

Añadir a `app/backend/src/test/java/co/edu/ggm/asistencia/entry/EntryTest.java` (dentro
de la clase, siguiendo el estilo de los tests que ya hay ahí):

```java
    @Test
    void aceptaElTextoCompletoDelCarnet() throws Exception {
        String token = tokenDe("fpalacios@ggm.edu.co", "DOCENTE");
        String id = UUID.randomUUID().toString();
        String cuerpo = """
                {"entries":[{"id":"%s","documentId":"Alvaro Mathias Orozco Lara 1013696566 Primero - 103","scannedAt":"2026-08-20T12:00:00Z"}]}
                """.formatted(id);

        mvc.perform(post("/api/entry/sync").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(1));
    }

    @Test
    void rechazaUnCarnetIlegibleConMotivoLegible() throws Exception {
        String token = tokenDe("fpalacios@ggm.edu.co", "DOCENTE");
        String id = UUID.randomUUID().toString();
        String cuerpo = """
                {"entries":[{"id":"%s","documentId":"carnet borroso","scannedAt":"2026-08-20T12:00:00Z"}]}
                """.formatted(id);

        mvc.perform(post("/api/entry/sync").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(0))
                .andExpect(jsonPath("$.rejected[0].reason").value("Carnet ilegible"));
    }
```

**Antes de escribirlo**, comprobar en `EntryTest.java` que el documento
`1013696566` corresponde a un estudiante activo de la semilla `V3__datos_semilla.sql`.
Si no existe, insertarlo al principio del test con el mismo mecanismo que usan los
demás tests de esa clase, o usar el documento que sí exista en la semilla.

- [x] **Step 2: Run test to verify it fails**

Run: `cd app/backend && mvn -B test -Dtest=EntryTest`
Expected: FAIL — `accepted` es 0 en el primero: el texto completo no es un documento.

- [x] **Step 3: Write minimal implementation**

Crear `app/backend/src/main/java/co/edu/ggm/asistencia/service/CarnetParser.java`:

```java
package co.edu.ggm.asistencia.service;

import java.util.regex.Pattern;

/**
 * El QR del carnet trae el texto completo en una linea:
 * "Alvaro Mathias Orozco Lara 1013696566 Primero - 103".
 * Solo interesa el documento; el nombre y el curso los decide la base de datos.
 * La cola offline puede traer escaneos viejos con el texto crudo, por eso el
 * servidor tiene que saber leerlo igual que el navegador.
 */
public final class CarnetParser {

    private static final Pattern DOCUMENTO = Pattern.compile("\\b(\\d{6,12})\\b");

    private CarnetParser() {}

    /** Devuelve el documento, o null si el texto no trae ninguno. */
    public static String documento(String raw) {
        if (raw == null) return null;
        var m = DOCUMENTO.matcher(raw);
        return m.find() ? m.group(1) : null;
    }
}
```

En `EntryController.sync`, reemplazar el arranque del bucle:

```java
        for (EntryDto e : req.entries()) {
            String documento = CarnetParser.documento(e.documentId());
            if (documento == null) {
                rejected.add(new Rejection(e.id(), "Carnet ilegible"));
                continue;
            }
            var student = students.findByDocumentIdAndActiveTrue(documento);
            if (student.isEmpty()) {
                rejected.add(new Rejection(e.id(), "Carnet no registrado"));
                continue;
            }
```

y añadir el import `import co.edu.ggm.asistencia.service.CarnetParser;`.

- [x] **Step 4: Run test to verify it passes**

Run: `cd app/backend && mvn -B test -Dtest=EntryTest`
Expected: PASS, todos los de `EntryTest`.

- [x] **Step 5: Run the whole backend suite**

Run: `cd app/backend && mvn -B verify -Dsurefire.runOrder=random`
Expected: 58 de 58 en verde (56 previos + 2 nuevos).

- [x] **Step 6: Commit**

```bash
git add app/backend/src/main/java/co/edu/ggm/asistencia/service/CarnetParser.java app/backend/src/main/java/co/edu/ggm/asistencia/controller/EntryController.java app/backend/src/test/java/co/edu/ggm/asistencia/entry/EntryTest.java
git commit -m "fix: la cola offline con el texto crudo del carnet ya no se rechaza entera"
```

---

### Task 4: Informe Excel — asistencia por curso y rango (matriz)

El informe que pide coordinación: una fila por estudiante, una columna por día
lectivo, con la letra del estado. El endpoint gana un parámetro `tipo`; sin él
devuelve exactamente lo de hoy.

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/repository/ReportRepository.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/repository/CalendarRepository.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/service/ExcelReportService.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/ReportController.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/report/ExcelTest.java` (crear)

**Interfaces:**
- Consumes: `ReportRepository.summary(grade, from, to)` ya existente.
- Produces:
  - `ReportRepository.MatrixRow` con `getStudentId():Long`, `getDocumentId():String`,
    `getFullName():String`, `getGrade():String`, `getClassDate():LocalDate`,
    `getStatus():String`.
  - `ReportRepository.matrix(String grade, LocalDate from, LocalDate to) : List<MatrixRow>`
  - `CalendarRepository.findByDayTypeAndCalendarDateBetweenOrderByCalendarDate(DayType, LocalDate, LocalDate) : List<SchoolDay>`
  - `ExcelReportService.buildMatriz(List<MatrixRow> filas, List<LocalDate> lectivos, LocalDate from, LocalDate to) : byte[]`

- [ ] **Step 1: Write the failing test**

Crear `app/backend/src/test/java/co/edu/ggm/asistencia/report/ExcelTest.java`. Copiar
la cabecera de paquete, anotaciones e imports de `ReportTest.java` que ya existe en esa
carpeta, y extender `AbstractIntegrationTest` igual que él:

```java
    @Test
    void laMatrizTieneUnaColumnaPorDiaLectivo() throws Exception {
        String token = tokenDe("coordinacion@ggm.edu.co", "COORDINADOR");
        byte[] libro = mvc.perform(get("/api/reports/excel")
                        .param("tipo", "matriz").param("grade", "601")
                        .param("from", "2026-08-18").param("to", "2026-08-20")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(libro))) {
            var cabecera = wb.getSheetAt(0).getRow(0);
            // Documento, Estudiante, Curso, 18, 19, 20, % Asistencia
            assertThat(cabecera.getLastCellNum()).isEqualTo(7);
            assertThat(cabecera.getCell(3).getStringCellValue()).isEqualTo("2026-08-18");
            assertThat(cabecera.getCell(6).getStringCellValue()).isEqualTo("% Asistencia");
        }
    }

    @Test
    void laMatrizPintaLaLetraDelEstadoEnElDiaQueCorresponde() throws Exception {
        String token = tokenDe("coordinacion@ggm.edu.co", "COORDINADOR");
        // Se marca una falta el 2026-08-19 al primer estudiante de 601.
        Long studentId = sembrarFalta("601", LocalDate.of(2026, 8, 19));

        byte[] libro = mvc.perform(get("/api/reports/excel")
                        .param("tipo", "matriz").param("grade", "601")
                        .param("from", "2026-08-18").param("to", "2026-08-20")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getContentAsByteArray();

        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(libro))) {
            var hoja = wb.getSheetAt(0);
            var fila = filaDe(hoja, studentId);
            assertThat(fila.getCell(4).getStringCellValue()).isEqualTo("F");   // 19 de agosto
            assertThat(fila.getCell(3).getStringCellValue()).isEmpty();        // 18: sin registro
        }
    }

    @Test
    void sinTipoDevuelveElResumenDeSiempreConSusNueveColumnas() throws Exception {
        String token = tokenDe("coordinacion@ggm.edu.co", "COORDINADOR");
        byte[] libro = mvc.perform(get("/api/reports/excel")
                        .param("from", "2026-08-18").param("to", "2026-08-20")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(libro))) {
            assertThat(wb.getSheetAt(0).getRow(0).getLastCellNum()).isEqualTo(9);
        }
    }
```

Añadir al final de la clase los dos auxiliares:

```java
    /** Marca una falta y devuelve el id del estudiante marcado. */
    private Long sembrarFalta(String grade, LocalDate dia) {
        var fila = jdbc.queryForMap("""
                SELECT s.id AS sid, b.id AS bid FROM students s
                JOIN schedule_blocks b ON b.grade = s.grade
                WHERE s.grade = ? AND s.active ORDER BY s.id LIMIT 1
                """, grade);
        Long sid = ((Number) fila.get("sid")).longValue();
        jdbc.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, recorded_by, recorded_at)
                VALUES (?, ?, ?, ?, 'F', (SELECT id FROM users ORDER BY id LIMIT 1), now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot DO UPDATE SET status = 'F'
                """, UUID.randomUUID(), sid, ((Number) fila.get("bid")).longValue(), dia);
        return sid;
    }

    private org.apache.poi.ss.usermodel.Row filaDe(org.apache.poi.ss.usermodel.Sheet hoja, Long studentId) {
        String documento = jdbc.queryForObject(
                "SELECT document_id FROM students WHERE id = ?", String.class, studentId);
        for (int i = 1; i <= hoja.getLastRowNum(); i++) {
            if (documento.equals(hoja.getRow(i).getCell(0).getStringCellValue())) return hoja.getRow(i);
        }
        throw new AssertionError("No aparece el estudiante " + documento + " en la matriz");
    }
```

Si `AbstractIntegrationTest` no expone un `JdbcTemplate` llamado `jdbc`, añadirlo ahí
con `@Autowired protected JdbcTemplate jdbc;` — es infraestructura de test compartida
y varios tests futuros la van a querer.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/backend && mvn -B test -Dtest=ExcelTest`
Expected: FAIL — el parámetro `tipo` se ignora y la cabecera tiene 9 columnas.

- [ ] **Step 3: Write minimal implementation**

En `ReportRepository.java`, añadir la proyección y la consulta:

```java
    interface MatrixRow {
        Long getStudentId();
        String getDocumentId();
        String getFullName();
        String getGrade();
        LocalDate getClassDate();
        String getStatus();
    }

    @Query(value = """
            SELECT s.id AS studentId,
                   s.document_id AS documentId,
                   trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
                        s.last_name, s.second_surname), '\\s+', ' ', 'g')) AS fullName,
                   s.grade AS grade,
                   a.class_date AS classDate,
                   a.status AS status
            FROM students s
            LEFT JOIN attendance a ON a.student_id = s.id AND a.class_date BETWEEN :from AND :to
            WHERE s.active AND (:grade IS NULL OR s.grade = :grade)
            ORDER BY s.grade, s.last_name, s.first_name, a.class_date
            """, nativeQuery = true)
    List<MatrixRow> matrix(@Param("grade") String grade,
                           @Param("from") LocalDate from,
                           @Param("to") LocalDate to);
```

En `CalendarRepository.java`, añadir el método derivado:

```java
    List<SchoolDay> findByDayTypeAndCalendarDateBetweenOrderByCalendarDate(
            DayType dayType, LocalDate from, LocalDate to);
```

(comprobar que los imports de `DayType` y `LocalDate` ya están; si no, añadirlos).

En `ExcelReportService.java`, añadir el método nuevo sin tocar `build`:

```java
    /**
     * Matriz estudiantes x dias lectivos. Una celda vacia significa "sin registro",
     * que no es lo mismo que una falta: si la docente no paso lista, decir "F" seria
     * inventarse una inasistencia.
     */
    public byte[] buildMatriz(List<ReportRepository.MatrixRow> filas,
                              List<LocalDate> lectivos, LocalDate from, LocalDate to) {
        try (var wb = new SXSSFWorkbook(100); var out = new ByteArrayOutputStream()) {
            var hoja = wb.createSheet("Asistencia " + from + " a " + to);

            Row cabecera = hoja.createRow(0);
            cabecera.createCell(0).setCellValue("Documento");
            cabecera.createCell(1).setCellValue("Estudiante");
            cabecera.createCell(2).setCellValue("Curso");
            for (int i = 0; i < lectivos.size(); i++) {
                cabecera.createCell(3 + i).setCellValue(lectivos.get(i).toString());
            }
            int colPorcentaje = 3 + lectivos.size();
            cabecera.createCell(colPorcentaje).setCellValue("% Asistencia");

            var porEstudiante = new LinkedHashMap<Long, List<ReportRepository.MatrixRow>>();
            for (var f : filas) porEstudiante.computeIfAbsent(f.getStudentId(), k -> new ArrayList<>()).add(f);

            int n = 1;
            for (var grupo : porEstudiante.values()) {
                var primera = grupo.get(0);
                Row r = hoja.createRow(n++);
                r.createCell(0).setCellValue(primera.getDocumentId());
                r.createCell(1).setCellValue(primera.getFullName());
                r.createCell(2).setCellValue(primera.getGrade());

                var porDia = new HashMap<LocalDate, String>();
                for (var f : grupo) if (f.getClassDate() != null) porDia.put(f.getClassDate(), f.getStatus());

                int asistidos = 0;
                for (int i = 0; i < lectivos.size(); i++) {
                    String estado = porDia.getOrDefault(lectivos.get(i), "");
                    r.createCell(3 + i).setCellValue(estado);
                    if ("P".equals(estado) || "T".equals(estado)) asistidos++;
                }
                r.createCell(colPorcentaje).setCellValue(lectivos.isEmpty() ? 0
                        : Math.round(asistidos * 1000.0 / lectivos.size()) / 10.0);
            }
            wb.write(out);
            wb.dispose();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
```

Añadir los imports que faltan en ese fichero:
`java.util.ArrayList`, `java.util.HashMap`, `java.util.LinkedHashMap`.

En `ReportController.java`, inyectar `CalendarRepository calendar` en el constructor y
reemplazar el método `excel` por:

```java
    @GetMapping("/excel")
    public ResponseEntity<byte[]> excel(
            @RequestParam(required = false) String grade,
            @RequestParam(required = false, defaultValue = "resumen") String tipo,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        byte[] libro;
        String nombre;
        switch (tipo) {
            case "matriz" -> {
                var lectivos = calendar
                        .findByDayTypeAndCalendarDateBetweenOrderByCalendarDate(DayType.LECTIVO, from, to)
                        .stream().map(SchoolDay::getCalendarDate).toList();
                libro = excel.buildMatriz(repo.matrix(grade, from, to), lectivos, from, to);
                nombre = "asistencia_matriz_%s_%s_%s.xlsx".formatted(grade == null ? "todos" : grade, from, to);
            }
            default -> {
                libro = excel.build(repo.summary(grade, from, to), from, to);
                nombre = "asistencia_%s_%s_%s.xlsx".formatted(grade == null ? "todos" : grade, from, to);
            }
        }
        return descarga(libro, nombre);
    }

    private ResponseEntity<byte[]> descarga(byte[] libro, String nombre) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nombre + "\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(libro);
    }
```

Añadir los imports `co.edu.ggm.asistencia.model.DayType`,
`co.edu.ggm.asistencia.model.SchoolDay` y `co.edu.ggm.asistencia.repository.CalendarRepository`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/backend && mvn -B test -Dtest=ExcelTest`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/backend/src/main/java/co/edu/ggm/asistencia app/backend/src/test/java/co/edu/ggm/asistencia
git commit -m "feat: informe Excel en matriz de estudiantes por dia lectivo"
```

---

### Task 5: Informe Excel — consolidado de inasistencias

Solo los estudiantes con faltas, de más a menos, con el detalle de las fechas. Es el
que usa coordinación para el proceso de seguimiento, y por eso importa que diga
**qué días** faltó, no solo cuántos.

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/repository/ReportRepository.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/service/ExcelReportService.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/ReportController.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/report/ExcelTest.java`

**Interfaces:**
- Consumes: `ReportRepository.matrix` de Task 4 (no se reutiliza; se añade consulta propia).
- Produces:
  - `ReportRepository.AbsenceRow` con `getDocumentId():String`, `getFullName():String`,
    `getGrade():String`, `getAbsences():int`, `getEvasions():int`, `getDates():String`.
  - `ReportRepository.absences(String grade, LocalDate from, LocalDate to) : List<AbsenceRow>`
  - `ExcelReportService.buildInasistencias(List<AbsenceRow> filas, LocalDate from, LocalDate to) : byte[]`

- [ ] **Step 1: Write the failing test**

Añadir a `ExcelTest.java`:

```java
    @Test
    void elConsolidadoSoloTraeEstudiantesConFaltas() throws Exception {
        String token = tokenDe("coordinacion@ggm.edu.co", "COORDINADOR");
        Long conFalta = sembrarFalta("601", LocalDate.of(2026, 8, 19));

        byte[] libro = mvc.perform(get("/api/reports/excel")
                        .param("tipo", "inasistencias").param("grade", "601")
                        .param("from", "2026-08-18").param("to", "2026-08-20")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(libro))) {
            var hoja = wb.getSheetAt(0);
            assertThat(hoja.getRow(0).getCell(3).getStringCellValue()).isEqualTo("Faltas");
            assertThat(hoja.getLastRowNum()).isGreaterThanOrEqualTo(1);
            // Todas las filas de datos tienen al menos una falta o una evasion
            for (int i = 1; i <= hoja.getLastRowNum(); i++) {
                double faltas = hoja.getRow(i).getCell(3).getNumericCellValue();
                double evasiones = hoja.getRow(i).getCell(4).getNumericCellValue();
                assertThat(faltas + evasiones).isGreaterThan(0);
            }
            var fila = filaDe(hoja, conFalta);
            assertThat(fila.getCell(5).getStringCellValue()).contains("2026-08-19");
        }
    }

    @Test
    void elConsolidadoOrdenaDeMasFaltasAMenos() throws Exception {
        String token = tokenDe("coordinacion@ggm.edu.co", "COORDINADOR");
        sembrarFalta("601", LocalDate.of(2026, 8, 18));
        sembrarFalta("601", LocalDate.of(2026, 8, 19));

        byte[] libro = mvc.perform(get("/api/reports/excel")
                        .param("tipo", "inasistencias").param("grade", "601")
                        .param("from", "2026-08-18").param("to", "2026-08-20")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getContentAsByteArray();

        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(libro))) {
            var hoja = wb.getSheetAt(0);
            double anterior = Double.MAX_VALUE;
            for (int i = 1; i <= hoja.getLastRowNum(); i++) {
                double faltas = hoja.getRow(i).getCell(3).getNumericCellValue();
                assertThat(faltas).isLessThanOrEqualTo(anterior);
                anterior = faltas;
            }
        }
    }
```

Nota: `sembrarFalta` usa `LIMIT 1` sobre el mismo estudiante, así que las dos llamadas
marcan al mismo en días distintos. Es lo que se quiere para el orden.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/backend && mvn -B test -Dtest=ExcelTest`
Expected: FAIL — `tipo=inasistencias` cae en el `default` y devuelve el resumen de 9
columnas, donde la columna 3 dice "Dias lectivos", no "Faltas".

- [ ] **Step 3: Write minimal implementation**

En `ReportRepository.java`:

```java
    interface AbsenceRow {
        String getDocumentId();
        String getFullName();
        String getGrade();
        int getAbsences();
        int getEvasions();
        String getDates();
    }

    @Query(value = """
            SELECT s.document_id AS documentId,
                   trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
                        s.last_name, s.second_surname), '\\s+', ' ', 'g')) AS fullName,
                   s.grade AS grade,
                   count(*) FILTER (WHERE a.status = 'F') AS absences,
                   count(*) FILTER (WHERE a.status = 'E') AS evasions,
                   string_agg(DISTINCT to_char(a.class_date, 'YYYY-MM-DD'), ', '
                              ORDER BY to_char(a.class_date, 'YYYY-MM-DD')) AS dates
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            WHERE a.class_date BETWEEN :from AND :to
              AND a.status IN ('F','E')
              AND s.active
              AND (:grade IS NULL OR s.grade = :grade)
            GROUP BY s.id, s.document_id, s.first_name, s.middle_name,
                     s.last_name, s.second_surname, s.grade
            ORDER BY count(*) FILTER (WHERE a.status = 'F') DESC,
                     count(*) FILTER (WHERE a.status = 'E') DESC,
                     s.last_name, s.first_name
            """, nativeQuery = true)
    List<AbsenceRow> absences(@Param("grade") String grade,
                              @Param("from") LocalDate from,
                              @Param("to") LocalDate to);
```

En `ExcelReportService.java`:

```java
    private static final String[] CABECERAS_INASISTENCIA =
            {"Documento", "Estudiante", "Curso", "Faltas", "Evasiones", "Fechas"};

    public byte[] buildInasistencias(List<ReportRepository.AbsenceRow> filas,
                                     LocalDate from, LocalDate to) {
        try (var wb = new SXSSFWorkbook(100); var out = new ByteArrayOutputStream()) {
            var hoja = wb.createSheet("Inasistencias " + from + " a " + to);

            Row cabecera = hoja.createRow(0);
            for (int i = 0; i < CABECERAS_INASISTENCIA.length; i++) {
                cabecera.createCell(i).setCellValue(CABECERAS_INASISTENCIA[i]);
            }
            int n = 1;
            for (var f : filas) {
                Row r = hoja.createRow(n++);
                r.createCell(0).setCellValue(f.getDocumentId());
                r.createCell(1).setCellValue(f.getFullName());
                r.createCell(2).setCellValue(f.getGrade());
                r.createCell(3).setCellValue(f.getAbsences());
                r.createCell(4).setCellValue(f.getEvasions());
                r.createCell(5).setCellValue(f.getDates() == null ? "" : f.getDates());
            }
            wb.write(out);
            wb.dispose();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
```

En `ReportController.excel`, añadir la rama al `switch`, antes del `default`:

```java
            case "inasistencias" -> {
                libro = excel.buildInasistencias(repo.absences(grade, from, to), from, to);
                nombre = "inasistencias_%s_%s_%s.xlsx".formatted(grade == null ? "todos" : grade, from, to);
            }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/backend && mvn -B test -Dtest=ExcelTest`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add app/backend/src/main/java app/backend/src/test/java
git commit -m "feat: informe Excel consolidado de inasistencias con el detalle de fechas"
```

---

### Task 6: Informe Excel — individual del estudiante

Una hoja con el historial completo de un estudiante, para entregársela al acudiente.
Este es el único que recibe `studentId` por parámetro, y es de personal del colegio:
va bajo el `@PreAuthorize` de la clase (`DOCENTE`, `COORDINADOR`, `ADMIN`). Un
acudiente **no** puede llamarlo: para eso tiene su portal, que resuelve los hijos
desde el JWT.

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/service/ExcelReportService.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/ReportController.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/report/ExcelTest.java`

**Interfaces:**
- Consumes: `StudentRepository.findById(Long)`, `Student.fullName()`,
  `Student.getGrade()`, `Student.getDocumentId()`, y
  `StudentRepository.recentAttendance(Long studentId, LocalDate from, LocalDate to)`
  que devuelve `List<RecentMark>` con `getClassDate():LocalDate`,
  `getSubject():String`, `getStatus():String`, `getComment():String`.
- Produces:
  `ExcelReportService.buildIndividual(String documento, String nombre, String curso, List<StudentRepository.RecentMark> marcas, LocalDate from, LocalDate to) : byte[]`

- [ ] **Step 1: Write the failing test**

Añadir a `ExcelTest.java`:

```java
    @Test
    void elInformeIndividualTraeLaCabeceraDelEstudianteYSusRegistros() throws Exception {
        String token = tokenDe("coordinacion@ggm.edu.co", "COORDINADOR");
        Long studentId = sembrarFalta("601", LocalDate.of(2026, 8, 19));

        byte[] libro = mvc.perform(get("/api/reports/excel")
                        .param("tipo", "individual").param("studentId", String.valueOf(studentId))
                        .param("from", "2026-08-18").param("to", "2026-08-20")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(libro))) {
            var hoja = wb.getSheetAt(0);
            assertThat(hoja.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Estudiante");
            assertThat(hoja.getRow(3).getCell(0).getStringCellValue()).isEqualTo("Fecha");
            assertThat(hoja.getRow(4).getCell(0).getStringCellValue()).isEqualTo("2026-08-19");
            assertThat(hoja.getRow(4).getCell(2).getStringCellValue()).isEqualTo("Falta");
        }
    }

    @Test
    void elInformeIndividualExigeStudentId() throws Exception {
        String token = tokenDe("coordinacion@ggm.edu.co", "COORDINADOR");
        mvc.perform(get("/api/reports/excel")
                        .param("tipo", "individual")
                        .param("from", "2026-08-18").param("to", "2026-08-20")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unAcudienteNoPuedeDescargarElInformeIndividualDeNadie() throws Exception {
        String token = tokenDe("acudiente@ggm.edu.co", "ACUDIENTE");
        mvc.perform(get("/api/reports/excel")
                        .param("tipo", "individual").param("studentId", "1")
                        .param("from", "2026-08-18").param("to", "2026-08-20")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }
```

Comprobar en `V3__datos_semilla.sql` el correo real del acudiente sembrado y usar ese
en el tercer test; si no hay ninguno, crearlo con `tokenDe` como hacen los demás tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/backend && mvn -B test -Dtest=ExcelTest`
Expected: FAIL — `tipo=individual` cae en el `default`.

- [ ] **Step 3: Write minimal implementation**

En `ExcelReportService.java`:

```java
    private static final Map<String, String> ESTADO_LEGIBLE = Map.of(
            "P", "Presente", "T", "Tarde", "F", "Falta", "E", "Evasion");

    /** Una hoja para entregarle al acudiente: se lee sin saber que significa "T". */
    public byte[] buildIndividual(String documento, String nombre, String curso,
                                  List<StudentRepository.RecentMark> marcas,
                                  LocalDate from, LocalDate to) {
        try (var wb = new SXSSFWorkbook(100); var out = new ByteArrayOutputStream()) {
            var hoja = wb.createSheet("Informe individual");

            Row r0 = hoja.createRow(0);
            r0.createCell(0).setCellValue("Estudiante");
            r0.createCell(1).setCellValue(nombre);
            Row r1 = hoja.createRow(1);
            r1.createCell(0).setCellValue("Documento");
            r1.createCell(1).setCellValue(documento);
            Row r2 = hoja.createRow(2);
            r2.createCell(0).setCellValue("Curso");
            r2.createCell(1).setCellValue(curso);
            r2.createCell(2).setCellValue("Periodo");
            r2.createCell(3).setCellValue(from + " a " + to);

            Row cab = hoja.createRow(3);
            cab.createCell(0).setCellValue("Fecha");
            cab.createCell(1).setCellValue("Asignatura");
            cab.createCell(2).setCellValue("Estado");
            cab.createCell(3).setCellValue("Observacion");

            int n = 4;
            for (var m : marcas) {
                Row r = hoja.createRow(n++);
                r.createCell(0).setCellValue(m.getClassDate().toString());
                r.createCell(1).setCellValue(m.getSubject() == null ? "" : m.getSubject());
                r.createCell(2).setCellValue(ESTADO_LEGIBLE.getOrDefault(m.getStatus(), m.getStatus()));
                r.createCell(3).setCellValue(m.getComment() == null ? "" : m.getComment());
            }
            wb.write(out);
            wb.dispose();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
```

Añadir los imports `java.util.Map` y
`co.edu.ggm.asistencia.repository.StudentRepository`.

En `ReportController.java`, inyectar `StudentRepository students` en el constructor,
añadir el parámetro `studentId` a la firma de `excel`:

```java
            @RequestParam(required = false) Long studentId,
```

y la rama del `switch`:

```java
            case "individual" -> {
                if (studentId == null) {
                    throw new org.springframework.web.server.ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "Falta el parametro studentId");
                }
                var s = students.findById(studentId).orElseThrow(() ->
                        new org.springframework.web.server.ResponseStatusException(
                                HttpStatus.NOT_FOUND, "Estudiante no encontrado"));
                libro = excel.buildIndividual(s.getDocumentId(), s.fullName(), s.getGrade(),
                        students.recentAttendance(studentId, from, to), from, to);
                nombre = "informe_%s_%s_%s.xlsx".formatted(s.getDocumentId(), from, to);
            }
```

Añadir el import `org.springframework.http.HttpStatus`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/backend && mvn -B test -Dtest=ExcelTest`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the whole backend suite in random order**

Run: `cd app/backend && mvn -B verify -Dsurefire.runOrder=random`
Expected: 66 de 66 en verde (56 previos + 2 de Task 3 + 8 de Excel). Si falla al
repetir, el problema es el aislamiento de `sembrarFalta`: usa `ON CONFLICT` a
propósito para poder correr dos veces.

- [ ] **Step 6: Commit**

```bash
git add app/backend/src
git commit -m "feat: informe Excel individual del estudiante para entregar al acudiente"
```

---

### Task 7: La pantalla de Consultas ofrece los tres informes

Los tres informes existen en la API pero nadie los puede pedir desde la interfaz.

**Files:**
- Modify: `app/frontend/src/pages/Consultas.tsx`
- Test: `app/frontend/src/pages/Consultas.test.tsx` (crear)

**Interfaces:**
- Consumes: `/api/reports/excel?tipo=resumen|matriz|inasistencias` (Tasks 4-6) y
  `/api/reports/summary`, ya existente.
- Produces: nada para otras tareas.

- [ ] **Step 1: Write the failing test**

Crear `app/frontend/src/pages/Consultas.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Consultas from './Consultas';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(async () => []) },
  getSession: () => ({ token: 't' }),
}));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) })));
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

async function llenarFechas(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Desde'), '2026-08-18');
  await user.type(screen.getByLabelText('Hasta'), '2026-08-20');
}

describe('Consultas', () => {
  it('ofrece los tres informes', () => {
    render(<Consultas />);
    const tipo = screen.getByLabelText('Informe') as HTMLSelectElement;
    expect([...tipo.options].map((o) => o.value))
      .toEqual(['resumen', 'matriz', 'inasistencias']);
  });

  it('descarga el tipo elegido', async () => {
    const user = userEvent.setup();
    render(<Consultas />);
    await llenarFechas(user);
    await user.selectOptions(screen.getByLabelText('Informe'), 'inasistencias');
    await user.click(screen.getByRole('button', { name: /descargar/i }));
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('tipo=inasistencias');
  });

  it('por defecto descarga el resumen', async () => {
    const user = userEvent.setup();
    render(<Consultas />);
    await llenarFechas(user);
    await user.click(screen.getByRole('button', { name: /descargar/i }));
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('tipo=resumen');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/frontend && npx vitest run src/pages/Consultas.test.tsx`
Expected: FAIL — no existe ningún control etiquetado "Informe".

- [ ] **Step 3: Write minimal implementation**

En `Consultas.tsx`, añadir el estado y meterlo en la query de descarga:

```tsx
  const [tipo, setTipo] = useState('resumen');
```

Cambiar `descargar` para que use `tipo` (la consulta en pantalla sigue usando
`/api/reports/summary`, que no cambia):

```tsx
  async function descargar() {
    setError('');
    try {
      const res = await fetch(`/api/reports/excel?${query()}&tipo=${tipo}`, {
        headers: { Authorization: `Bearer ${getSession()!.token}` },
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tipo}_${grade || 'todos'}_${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo descargar el informe.');
    }
  }
```

Y en el bloque `<div className="filtros">`, después del campo "Hasta":

```tsx
        <label htmlFor="tipo">Informe</label>
        <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="resumen">Resumen por estudiante</option>
          <option value="matriz">Asistencia dia por dia</option>
          <option value="inasistencias">Consolidado de inasistencias</option>
        </select>
```

El informe individual no va aquí: se pide desde la ficha de un estudiante y aún no hay
pantalla de ficha. Queda expuesto en la API para la siguiente versión.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/frontend && npx vitest run src/pages/Consultas.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/frontend/src/pages/Consultas.tsx app/frontend/src/pages/Consultas.test.tsx
git commit -m "feat: elegir cual de los tres informes se descarga"
```

---

### Task 8: El administrador marca un rango de días de una vez

Un paro de tres días o un receso que la rectoría mueve son rangos. Hoy hay que
cambiar día por día, que es donde la gente se equivoca.

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/service/CalendarService.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/CalendarController.java`
- Modify: `app/frontend/src/components/admin/PanelCalendario.tsx`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/calendar/CalendarTest.java`
- Test: `app/frontend/src/components/admin/PanelCalendario.test.tsx`

**Interfaces:**
- Consumes: `CalendarService.update(LocalDate, DayType, String, Long)` ya existente.
- Produces:
  - `CalendarService.updateRange(LocalDate from, LocalDate to, DayType type, String description, boolean soloHabiles, Long userId) : int` (devuelve cuántos días cambió)
  - `PUT /api/calendar/school-days` con cuerpo
    `{from, to, dayType, description, soloHabiles}` → `{"cambiados": n}`

- [ ] **Step 1: Write the failing test (backend)**

Añadir a `CalendarTest.java`:

```java
    @Test
    void marcaUnRangoCompletoDeUnaVez() throws Exception {
        String token = tokenDe("rectoria@ggm.edu.co", "ADMIN");
        String cuerpo = """
                {"from":"2026-09-07","to":"2026-09-09","dayType":"SUSPENDIDO","description":"Paro","soloHabiles":true}
                """;

        mvc.perform(put("/api/calendar/school-days").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cambiados").value(3));

        mvc.perform(get("/api/calendar/school-days")
                        .param("from", "2026-09-07").param("to", "2026-09-09")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$[0].dayType").value("SUSPENDIDO"))
                .andExpect(jsonPath("$[2].dayType").value("SUSPENDIDO"));
    }

    @Test
    void conSoloHabilesNoTocaElFinDeSemana() throws Exception {
        String token = tokenDe("rectoria@ggm.edu.co", "ADMIN");
        // 2026-09-11 viernes a 2026-09-14 lunes: sabado y domingo en medio
        String cuerpo = """
                {"from":"2026-09-11","to":"2026-09-14","dayType":"INSTITUCIONAL","description":"Jornada","soloHabiles":true}
                """;

        mvc.perform(put("/api/calendar/school-days").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(jsonPath("$.cambiados").value(2));
    }

    @Test
    void unDocenteNoPuedeCambiarElCalendario() throws Exception {
        String token = tokenDe("fpalacios@ggm.edu.co", "DOCENTE");
        String cuerpo = """
                {"from":"2026-09-07","to":"2026-09-09","dayType":"SUSPENDIDO","description":"Paro","soloHabiles":true}
                """;

        mvc.perform(put("/api/calendar/school-days").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isForbidden());
    }

    @Test
    void elRangoAlReves_seRechaza() throws Exception {
        String token = tokenDe("rectoria@ggm.edu.co", "ADMIN");
        String cuerpo = """
                {"from":"2026-09-09","to":"2026-09-07","dayType":"SUSPENDIDO","description":"","soloHabiles":true}
                """;

        mvc.perform(put("/api/calendar/school-days").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isBadRequest());
    }
```

Usar el correo de ADMIN que exista realmente en `V3__datos_semilla.sql`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/backend && mvn -B test -Dtest=CalendarTest`
Expected: FAIL — 405 o 404: no hay `PUT` en `/api/calendar/school-days` sin fecha.

- [ ] **Step 3: Write minimal implementation**

En `CalendarService.java`:

```java
    /**
     * Un paro o un receso movido son rangos, no dias sueltos. Con soloHabiles se
     * saltan sabados y domingos: nadie quiere marcar el fin de semana como jornada
     * pedagogica. Devuelve cuantos dias cambio.
     */
    @Transactional
    public int updateRange(LocalDate from, LocalDate to, DayType type,
                           String description, boolean soloHabiles, Long userId) {
        int n = 0;
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            if (soloHabiles && d.getDayOfWeek().getValue() > 5) continue;
            update(d, type, description, userId);
            n++;
        }
        return n;
    }
```

Añadir el import `java.time.LocalDate` si no está (sí está).

En `CalendarController.java`:

```java
    public record RangeRequest(@NotNull LocalDate from, @NotNull LocalDate to,
                               @NotNull DayType dayType, String description,
                               boolean soloHabiles) {}

    @PutMapping("/school-days")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    public Map<String, Integer> updateRange(@Valid @RequestBody RangeRequest req) {
        if (req.to().isBefore(req.from())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El rango esta al reves");
        }
        if (req.from().plusDays(400).isBefore(req.to())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El rango no puede pasar de un ano");
        }
        int n = service.updateRange(req.from(), req.to(), req.dayType(), req.description(),
                req.soloHabiles(), JwtService.currentUserId());
        return Map.of("cambiados", n);
    }
```

Añadir los imports `java.util.Map`, `org.springframework.http.HttpStatus` y
`org.springframework.web.server.ResponseStatusException`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/backend && mvn -B test -Dtest=CalendarTest`
Expected: PASS, todos los de `CalendarTest`.

- [ ] **Step 5: Write the failing frontend test**

Añadir a `app/frontend/src/components/admin/PanelCalendario.test.tsx`, siguiendo el
patrón de simulación de `api` que ya usa ese fichero:

```tsx
  it('marca un rango completo con un solo PUT', async () => {
    const user = userEvent.setup();
    render(<PanelCalendario />);
    await user.click(await screen.findByRole('button', { name: /marcar un rango/i }));
    await user.type(screen.getByLabelText('Rango desde'), '2026-09-07');
    await user.type(screen.getByLabelText('Rango hasta'), '2026-09-09');
    await user.selectOptions(screen.getByLabelText('Tipo del rango'), 'SUSPENDIDO');
    await user.type(screen.getByLabelText('Motivo del rango'), 'Paro');
    await user.click(screen.getByRole('button', { name: /aplicar al rango/i }));

    expect(vi.mocked(api.put)).toHaveBeenCalledWith('/api/calendar/school-days', {
      from: '2026-09-07', to: '2026-09-09',
      dayType: 'SUSPENDIDO', description: 'Paro', soloHabiles: true,
    });
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd app/frontend && npx vitest run src/components/admin/PanelCalendario.test.tsx`
Expected: FAIL — no hay botón "Marcar un rango".

- [ ] **Step 7: Write the panel implementation**

En `PanelCalendario.tsx`, añadir el estado del formulario de rango y el bloque, encima
de la tabla de días. Seguir el estilo y el manejo de errores que ya tiene el
componente (`setError` con `role="alert"`):

```tsx
  const [abierto, setAbierto] = useState(false);
  const [rDesde, setRDesde] = useState('');
  const [rHasta, setRHasta] = useState('');
  const [rTipo, setRTipo] = useState('SUSPENDIDO');
  const [rMotivo, setRMotivo] = useState('');

  async function aplicarRango() {
    try {
      await api.put('/api/calendar/school-days', {
        from: rDesde, to: rHasta, dayType: rTipo, description: rMotivo, soloHabiles: true,
      });
      await recargar();          // la funcion que el componente ya usa tras un PUT
      setAbierto(false);
    } catch {
      setError('No se pudo aplicar el rango.');
    }
  }
```

y en el JSX:

```tsx
      <button type="button" onClick={() => setAbierto((v) => !v)}>Marcar un rango</button>
      {abierto && (
        <div className="filtros">
          <label htmlFor="r-desde">Rango desde</label>
          <input id="r-desde" type="date" value={rDesde} onChange={(e) => setRDesde(e.target.value)} />
          <label htmlFor="r-hasta">Rango hasta</label>
          <input id="r-hasta" type="date" value={rHasta} onChange={(e) => setRHasta(e.target.value)} />
          <label htmlFor="r-tipo">Tipo del rango</label>
          <select id="r-tipo" value={rTipo} onChange={(e) => setRTipo(e.target.value)}>
            <option value="LECTIVO">Lectivo</option>
            <option value="FESTIVO">Festivo</option>
            <option value="VACACIONES">Vacaciones</option>
            <option value="INSTITUCIONAL">Institucional</option>
            <option value="SUSPENDIDO">Suspendido</option>
          </select>
          <label htmlFor="r-motivo">Motivo del rango</label>
          <input id="r-motivo" value={rMotivo} onChange={(e) => setRMotivo(e.target.value)} />
          <button type="button" disabled={!rDesde || !rHasta} onClick={() => void aplicarRango()}>
            Aplicar al rango
          </button>
          <p className="meta">Solo se cambian los dias de lunes a viernes.</p>
        </div>
      )}
```

Si el componente no tiene una función `recargar` reutilizable, extraer la carga de
días que ya hace el `useEffect` a una función con ese nombre y llamarla desde los dos
sitios. No duplicar la petición.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd app/frontend && npm test`
Expected: todo en verde, con el test de rango incluido.

- [ ] **Step 9: Commit**

```bash
git add app/backend/src app/frontend/src/components/admin
git commit -m "feat: el administrador marca un rango de dias sin ir uno por uno"
```

---

### Task 9: Blindar por test que un acudiente solo ve a sus hijos

El código ya lo hace bien. Lo que falta es que **falle ruidosamente** si alguien en el
futuro le añade un parámetro `studentId` al portal. Son datos de menores: la garantía
va escrita en un test, no en la memoria de nadie.

**Files:**
- Modify: `app/backend/src/test/java/co/edu/ggm/asistencia/student/GuardianTest.java`

**Interfaces:**
- Consumes: `GET /api/guardian/children`, `StudentRepository.findChildren`.
- Produces: nada.

- [ ] **Step 1: Write the failing test**

Añadir a `GuardianTest.java`:

```java
    @Test
    void unAcudienteNoVeAlHijoDeOtro() throws Exception {
        // Dos acudientes, cada uno con un hijo distinto. El primero no puede ver al
        // segundo por ningun camino.
        String tokenA = tokenDe("acudiente.a@ggm.edu.co", "ACUDIENTE");
        Long hijoDeB = idDelHijoDe("acudiente.b@ggm.edu.co");

        String respuesta = mvc.perform(get("/api/guardian/children")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(respuesta).doesNotContain("\"studentId\":" + hijoDeB);
    }

    @Test
    void pasarStudentIdPorParametroNoCambiaNada() throws Exception {
        // Si alguien anade un parametro studentId al portal en el futuro, este test
        // se cae: el endpoint tiene que ignorar cualquier estudiante que venga del
        // cliente y resolver los hijos desde el JWT.
        String tokenA = tokenDe("acudiente.a@ggm.edu.co", "ACUDIENTE");
        Long hijoDeB = idDelHijoDe("acudiente.b@ggm.edu.co");

        String conParametro = mvc.perform(get("/api/guardian/children")
                        .param("studentId", String.valueOf(hijoDeB))
                        .header("Authorization", "Bearer " + tokenA))
                .andReturn().getResponse().getContentAsString();
        String sinParametro = mvc.perform(get("/api/guardian/children")
                        .header("Authorization", "Bearer " + tokenA))
                .andReturn().getResponse().getContentAsString();

        assertThat(conParametro).isEqualTo(sinParametro);
        assertThat(conParametro).doesNotContain("\"studentId\":" + hijoDeB);
    }
```

Y el auxiliar, si no existe ya algo equivalente en la clase:

```java
    private Long idDelHijoDe(String correoAcudiente) {
        return jdbc.queryForObject("""
                SELECT g.student_id FROM guardianships g
                JOIN users u ON u.id = g.guardian_id
                WHERE u.email = ? LIMIT 1
                """, Long.class, correoAcudiente);
    }
```

Los dos acudientes con un hijo cada uno se crean al principio del test con el
mecanismo que la clase ya use (semilla o inserción directa). Si `GuardianTest` ya
tiene un montaje con acudientes, reutilizarlo en vez de crear otro.

- [ ] **Step 2: Run test to verify it fails or passes for the right reason**

Run: `cd app/backend && mvn -B test -Dtest=GuardianTest`
Expected: PASS a la primera. **Esto está bien**: es un test de regresión sobre
comportamiento ya correcto. Para comprobar que el test sirve de algo, verificarlo al
revés: añadir temporalmente a `GuardianController.children` un
`@RequestParam(required=false) Long studentId` que, si viene, devuelva ese estudiante;
correr el test y ver que **falla**; deshacer el cambio. Un test que no puede fallar no
prueba nada.

- [ ] **Step 3: Commit**

```bash
git add app/backend/src/test/java/co/edu/ggm/asistencia/student/GuardianTest.java
git commit -m "test: el portal del acudiente no puede filtrarse a otro estudiante"
```

---

### Task 10: El frontend habla con una API en otro dominio

En Vercel el frontend ya no comparte origen con la API. Todas las llamadas usan hoy
rutas relativas (`/api/...`), que en Vercel apuntarían a Vercel.

**Files:**
- Modify: `app/frontend/src/api/client.ts`
- Modify: `app/frontend/src/pages/Consultas.tsx`
- Modify: `app/frontend/vite.config.ts`
- Create: `app/frontend/.env.example`
- Create: `vercel.json` (en la raíz del repositorio)
- Test: `app/frontend/src/api/client.test.ts` (añadir casos)

**Interfaces:**
- Consumes: nada.
- Produces: `export function apiUrl(path: string): string` desde `src/api/client.ts`.

- [ ] **Step 1: Write the failing test**

Añadir a `app/frontend/src/api/client.test.ts`:

```ts
import { apiUrl } from './client';

describe('apiUrl', () => {
  it('sin VITE_API_URL deja la ruta relativa (backend en el mismo origen)', () => {
    expect(apiUrl('/api/auth/login')).toBe('/api/auth/login');
  });
});
```

El caso con variable puesta se comprueba con `import.meta.env` simulado; si resulta
frágil en vitest, basta el caso relativo más una comprobación de que ninguna llamada
usa ya una ruta cruda:

```ts
it('ningun modulo llama a fetch con /api sin pasar por apiUrl', async () => {
  const fuentes = import.meta.glob('../**/*.{ts,tsx}', { as: 'raw', eager: true });
  const culpables = Object.entries(fuentes)
    .filter(([f]) => !f.includes('.test.') && !f.includes('/api/client.ts'))
    .filter(([, src]) => /fetch\(\s*[`'"]\/api\//.test(src as string))
    .map(([f]) => f);
  expect(culpables).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL — no existe `apiUrl`, y `Consultas.tsx` llama a `fetch('/api/...')`.

- [ ] **Step 3: Write minimal implementation**

En `src/api/client.ts`, arriba del todo:

```ts
/**
 * En desarrollo y en la imagen Docker el backend sirve el frontend, asi que la ruta
 * relativa funciona. En Vercel la API vive en otro dominio (Fly.io) y hace falta la
 * URL absoluta. Una sola variable decide las dos situaciones.
 */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  return BASE + path;
}
```

Y usarla en los tres `fetch` del fichero: dentro de `request` (`fetch(apiUrl(path), ...)`),
en `refresh` (`fetch(apiUrl('/api/auth/refresh'), ...)`) y en `login`
(`fetch(apiUrl('/api/auth/login'), ...)`).

En `Consultas.tsx`, importar `apiUrl` y cambiar la descarga:

```tsx
import { api, apiUrl, getSession } from '../api/client';
...
      const res = await fetch(apiUrl(`/api/reports/excel?${query()}&tipo=${tipo}`), {
```

Buscar cualquier otro `fetch('/api` que quede: `grep -rn "fetch(\['\"\`]/api" app/frontend/src`
— el test del Step 1 lo hace solo, pero conviene mirar.

En `vite.config.ts`, cambiar la regla de caché de la API, que se escribió para el mismo
origen:

```ts
        runtimeCaching: [
          // La API vive en otro dominio en produccion (Fly.io). Nunca se cachea: los
          // datos de asistencia tienen que ser los de ahora, y la cola offline ya
          // resuelve el caso de no tener senal.
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
        ],
```

Crear `app/frontend/.env.example`:

```
# URL del backend. Vacio = mismo origen (desarrollo con proxy, o imagen Docker).
# En Vercel: https://asistencia-ggm.fly.dev
VITE_API_URL=
```

Crear `vercel.json` en la raíz del repositorio:

```json
{
  "buildCommand": "cd app/frontend && npm ci && npm run build",
  "outputDirectory": "app/frontend/dist",
  "installCommand": "echo saltado",
  "rewrites": [{ "source": "/((?!assets/).*)", "destination": "/index.html" }]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app/frontend && npm test && npm run build`
Expected: todo en verde; build limpio.

- [ ] **Step 5: Verify the local flow still works**

Run: `cd app/frontend && npm run dev` con el backend levantado en el 8080, y entrar a
`http://localhost:5173`. Sin `VITE_API_URL`, el proxy de Vite sigue funcionando igual
que antes. Comprobar que se puede iniciar sesión.

- [ ] **Step 6: Commit**

```bash
git add app/frontend/src app/frontend/vite.config.ts app/frontend/.env.example vercel.json
git commit -m "feat: la API puede vivir en otro dominio, para desplegar el frontend en Vercel"
```

---

### Task 11: Backend en Fly.io contra Supabase

CORS por variable de entorno (hoy son dominios fijos en el código), configuración de
Fly y las instrucciones de Supabase, que tienen una trampa: su *pooler* de
transacciones rompe las sentencias preparadas de JDBC.

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/config/SecurityConfig.java`
- Modify: `app/backend/src/main/resources/application.yml`
- Create: `fly.toml` (en la raíz del repositorio)
- Modify: `docs/DESPLIEGUE.md`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/config/CorsTest.java` (crear)

**Interfaces:**
- Consumes: nada.
- Produces: variable de entorno `APP_CORS_ORIGINS` (lista separada por comas).

- [ ] **Step 1: Write the failing test**

Crear `app/backend/src/test/java/co/edu/ggm/asistencia/config/CorsTest.java`, copiando
la cabecera y anotaciones de `SpaRoutingTest.java` que ya está en esa carpeta:

```java
    @Test
    void aceptaElOrigenConfigurado() throws Exception {
        mvc.perform(options("/api/auth/login")
                        .header("Origin", "https://asistencia-ggm.vercel.app")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin",
                        "https://asistencia-ggm.vercel.app"));
    }

    @Test
    void rechazaUnOrigenQueNoEsta() throws Exception {
        mvc.perform(options("/api/auth/login")
                        .header("Origin", "https://sitio-de-otro.com")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
    }
```

Y en `app/backend/src/test/resources/application-test.yml`, añadir:

```yaml
app:
  cors:
    origins: http://localhost:5173,https://asistencia-ggm.vercel.app
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/backend && mvn -B test -Dtest=CorsTest`
Expected: FAIL — el origen de Vercel no está en la lista fija del código.

- [ ] **Step 3: Write minimal implementation**

En `SecurityConfig.java`, inyectar la lista y usarla:

```java
    @Bean
    SecurityFilterChain filterChain(
            HttpSecurity http, JwtFilter jwtFilter,
            @Value("${app.cors.origins:http://localhost:5173}") List<String> origenes) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(request -> {
                var config = new CorsConfiguration();
                config.setAllowedOriginPatterns(origenes);
                config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
                config.setAllowedHeaders(List.of("*"));
                return config;
            }))
            ...
```

Añadir el import `org.springframework.beans.factory.annotation.Value`.

En `application.yml`, bajo `app:`:

```yaml
  cors:
    # Separados por comas. El frontend en Vercel vive en otro dominio que el backend.
    origins: ${APP_CORS_ORIGINS:http://localhost:5173,https://*.ggm.edu.co}
```

Crear `fly.toml` en la raíz:

```toml
app = "asistencia-ggm"
primary_region = "bog"

[build]
  dockerfile = "Dockerfile"

[env]
  NOTIFY_ENABLED = "false"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

  [http_service.checks]
    [[http_service.checks.http]]
      path = "/actuator/health"
      interval = "30s"
      timeout = "5s"
      grace_period = "60s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"
```

`min_machines_running = 1` a propósito: el arranque en frío de Spring Boot con Flyway
tarda, y la docente que abre la app en el salón no debe esperar 30 segundos.

En `docs/DESPLIEGUE.md`, añadir una sección **"Opción C: Vercel + Supabase + Fly.io"**
con:

````markdown
### 1. Supabase

Crear el proyecto y copiar la cadena de conexión de **Session pooler** (puerto 5432),
no la de Transaction pooler (6543): el *pooler* de transacciones no conserva las
sentencias preparadas de JDBC y Hibernate falla de forma intermitente y difícil de
diagnosticar.

```
DB_URL=jdbc:postgresql://aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
DB_USER=postgres.<referencia-del-proyecto>
DB_PASSWORD=<la del proyecto>
```

Flyway aplica las migraciones solo al arrancar. Comprobar después:
`select version, description, success from flyway_schema_history order by installed_rank;`

### 2. Backend en Fly.io

```bash
fly launch --no-deploy            # usa el fly.toml del repositorio
fly secrets set \
  DB_URL='jdbc:postgresql://...:5432/postgres?sslmode=require' \
  DB_USER='postgres.xxxx' \
  DB_PASSWORD='...' \
  JWT_SECRET="$(openssl rand -base64 48)" \
  APP_CORS_ORIGINS='https://asistencia-ggm.vercel.app'
fly deploy
curl https://asistencia-ggm.fly.dev/actuator/health     # {"status":"UP"}
```

### 3. Frontend en Vercel

Importar el repositorio; `vercel.json` de la raíz ya trae el build y las rutas de la
SPA. Añadir la variable de entorno **de build**:

```
VITE_API_URL = https://asistencia-ggm.fly.dev
```

Es de build, no de ejecución: Vite la incrusta al compilar. Cambiarla obliga a volver
a desplegar.

### 4. Comprobación

```bash
bash tools/humo.sh https://asistencia-ggm.fly.dev
```

Los invariantes de rutas de la SPA fallarán, y está bien: en este despliegue la SPA la
sirve Vercel, no el backend. Los demás tienen que pasar.
````

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app/backend && mvn -B test -Dtest=CorsTest`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the whole backend suite**

Run: `cd app/backend && mvn -B verify -Dsurefire.runOrder=random`
Expected: todo en verde. Comprobar en particular que `SpaRoutingTest` sigue pasando: la
imagen Docker sigue sirviendo la SPA y ese camino no se ha tocado.

- [ ] **Step 6: Commit**

```bash
git add app/backend/src fly.toml docs/DESPLIEGUE.md
git commit -m "feat: CORS por variable de entorno y despliegue en Fly contra Supabase"
```

---

### Task 12: Verificación en el navegador real y cierre

Los tres bugs más serios del proyecto no los encontró ningún test: los encontró mirar
el sistema funcionando. Esta tarea es esa mirada, y solo se da por buena con capturas.

**Files:**
- Modify: `docs/INFORME-FINAL.md`
- Modify: `docs/ESTADO.md`
- Create: `docs/e2e-v2-carnet.png`, `docs/e2e-v2-informes.png`, `docs/e2e-v2-calendario.png`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada.

- [ ] **Step 1: Levantar el sistema completo en local**

Run:
```bash
cd app/backend && mvn -B spring-boot:run &
cd app/frontend && npm run dev
```
Expected: `http://localhost:5173` responde y `curl localhost:8080/actuator/health` da
`{"status":"UP"}`.

- [ ] **Step 2: Generar un QR de prueba con el formato real**

Crear un fichero HTML temporal en el scratchpad con un QR que contenga exactamente
`Álvaro Mathias Orozco Lara 1013696566 Primero - 103`, y sembrar en la base un
estudiante con `document_id = '1013696566'` y `grade = '103'`.

Si no hay generador de QR a mano, comprobar el parseo por la vía del servidor, que es
la que importa:

```bash
TOKEN=$(curl -s -X POST localhost:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"fpalacios@ggm.edu.co","password":"cambiar123"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -X POST localhost:8080/api/entry/sync -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"entries":[{"id":"'"$(uuidgen)"'","documentId":"Álvaro Mathias Orozco Lara 1013696566 Primero - 103","scannedAt":"2026-08-20T12:00:00Z"}]}'
```
Expected: `{"accepted":1,...}` con el nombre que tiene la base.

- [ ] **Step 3: Recorrer la aplicación con agent-browser**

Con las herramientas de navegador (`mcp__claude-in-chrome__*`), en una pestaña nueva:

1. Entrar con el docente y comprobar el saludo.
2. Ir a **Consultas**, elegir "Consolidado de inasistencias", descargar, y comprobar
   que el fichero llega y abre. Captura: `docs/e2e-v2-informes.png`.
3. Entrar como ADMIN, ir a **Administración → Calendario**, marcar un rango de tres
   días como SUSPENDIDO y comprobar que los tres cambian y que el fin de semana no.
   Captura: `docs/e2e-v2-calendario.png`.
4. Volver como docente a **Asistencia** y comprobar que esos días ya no aparecen en el
   selector de fecha. Es la prueba de que el calendario llega hasta la interfaz.
5. Entrar como acudiente y comprobar que ve a su hijo y a nadie más.
   Captura: `docs/e2e-v2-carnet.png` (o la de la pantalla de escaneo, si se pudo).

Consultar la consola del navegador con `read_console_messages` en cada pantalla: un
error de CORS o de red aparece ahí y en ningún test.

- [ ] **Step 4: Prueba de humo completa**

Run: `bash tools/humo.sh http://localhost:8080`
Expected: los 15 invariantes en verde. Si alguno falla, **el fallo manda**: arreglar
antes de seguir.

- [ ] **Step 5: Suites completas de los dos lados**

Run:
```bash
cd app/backend && mvn -B verify -Dsurefire.runOrder=random
cd app/frontend && npm test && npm run build
```
Expected: todo en verde. Anotar las cifras exactas: son las que van al informe.

- [ ] **Step 6: Actualizar la documentación con lo que se observó**

En `docs/INFORME-FINAL.md`, añadir una sección **"6.f Sexta iteración: el carnet real y
la salida a producción"** con: el formato del QR y por qué el parseo va también en el
servidor, los tres informes, el rango del calendario, el test de aislamiento del
portal del acudiente, y la arquitectura de despliegue en tres proveedores. Escribir las
cifras observadas, no estimadas, y **decir explícitamente qué no se pudo verificar**
(por ejemplo, escanear un carnet físico de verdad).

En `docs/ESTADO.md`, añadir una línea por tarea con el formato de la bitácora.

- [ ] **Step 7: Commit**

```bash
git add docs
git commit -m "docs: informe con la sexta iteracion y la verificacion en navegador"
```

---

## Self-Review

**Cobertura de la spec:**

| Requisito | Tareas |
|---|---|
| R1 carnet con texto completo | 1, 2, 3 |
| R2 tres informes Excel | 4, 5, 6, 7 |
| R3 calendario por rango | 8 |
| R4 acudiente solo sus hijos | 9 |
| R5 Vercel + Supabase + Fly | 10, 11 |
| R6 verificado en navegador | 12 |

**Consistencia de tipos comprobada:** `parseCarnet` (Task 1) devuelve
`{documentId, nombre, curso}` y así se consume en Task 2. `CarnetParser.documento`
(Task 3) devuelve `String` o `null` y así se usa en `EntryController`. `MatrixRow` de
Task 4 se consume solo en `buildMatriz`. `AbsenceRow` de Task 5, solo en
`buildInasistencias`. `RecentMark` de Task 6 es el tipo que `StudentRepository` ya
expone hoy. `apiUrl` (Task 10) se define en `client.ts` y se importa en `Consultas.tsx`.
`APP_CORS_ORIGINS` (Task 11) es la única variable nueva del backend.

**Dos avisos para quien ejecute:**

- Los correos y contraseñas de la semilla que aparecen en los tests
  (`fpalacios@ggm.edu.co`, `coordinacion@ggm.edu.co`, `rectoria@ggm.edu.co`,
  `acudiente@ggm.edu.co`) hay que **comprobarlos contra `V3__datos_semilla.sql`** antes
  de escribir cada test. Si alguno no existe, crearlo en el test con `tokenDe`.
- Las tareas 1-9 son independientes de las 10-11 y se pueden hacer en cualquier orden.
  La 12 va la última siempre.
