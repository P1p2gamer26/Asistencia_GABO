# La Interfaz a Escala Real — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglar los tres puntos donde la interfaz, diseñada y probada con 3 estudiantes, se comporta mal con los 1.200 reales del colegio.

**Architecture:** No se toca el backend, que quedó medido y sobra de rápido. Los tres arreglos son de presentación: la pantalla de consultas exige elegir un curso en vez de traerse el colegio entero, el gráfico de tendencia reparte las zonas sensibles según cuántos días haya, y el de barras se vuelve desplazable cuando hay muchos cursos.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react.

**Spec:** Mediciones del 22 de agosto de 2026 con `tools/datos-de-carga.sql`, registradas en la sección 6.g de `docs/INFORME-FINAL.md`.

## Lo que se midió antes de decidir

Se generó el volumen real del colegio —1.200 estudiantes, 80 docentes, 900 bloques de horario y un semestre completo: **620.748 registros de asistencia, 146 MB**— y se midió todo contra esa base. **El backend no necesita nada:**

| Petición | Tiempo | Tamaño |
|---|---|---|
| Paquete de arranque del docente | 87 ms | 9,6 KB |
| Bloques pendientes de hoy | 67 ms | — |
| Tablero, 30 días | 163 ms | 3,1 KB |
| Tablero, semestre entero | 210 ms | 6,4 KB |
| Resumen de un curso | 79 ms | 7,3 KB |
| **Resumen de todo el colegio** | **355 ms** | **218 KB** |
| Informe en Excel del semestre | 972 ms | 64 KB |
| Sincronizar un curso (40 registros) | 101 ms | — |
| Sincronizar una jornada (240 registros) | 290 ms | — |
| Portal del acudiente | 32 ms | — |

También se validó el dimensionamiento que el informe venía afirmando sin medir: **230 bytes por fila reales** contra los 250 estimados. La cifra de ~400 MB al año se sostiene.

Los tres problemas son de interfaz, y los tres tienen la misma causa: **se diseñaron mirando tres estudiantes.**

1. **`Consultas` se trae el colegio entero.** Sin filtro de curso son 1.203 filas y 218 KB, que la pantalla pinta de una vez. Sobre la conexión del colegio es una descarga larga, y un teléfono modesto tiene que renderizar 1.203 filas de tabla.
2. **El gráfico de tendencia amontona las zonas sensibles.** Con 86 días lectivos, los puntos quedan a ~11 px y las zonas de toque miden 20 px: se solapan, así que tocar un día devuelve otro.
3. **El gráfico de barras crece sin límite.** 30 cursos son 1.020 px de alto; el usuario pierde la referencia de qué está mirando al desplazarse.

## Global Constraints

- **El proyecto vive en `app/`.** Frontend: `cd app/frontend && npm test` y `npm run build`.
- **No se toca el backend.** Está medido y le sobra margen; cualquier cambio ahí en esta tanda es alcance que nadie pidió.
- **`waitFor`, nunca `findByRole`,** para contenido que depende de un efecto asíncrono.
- **Sin dependencias nuevas.** Ni librería de gráficas ni de tablas virtualizadas: los tres arreglos son aritmética y un `overflow`.
- **El paquete de producción debe seguir por debajo de 200 KB gzip** (hoy 99,8 KB).
- **El orden de apilado y los colores de estado no se tocan**: `P #0ca30c`, `T #fab219`, `F #d03b3b`, `E #ec835a`, en ese orden, que es el único que pasa las comprobaciones de daltonismo.
- **Idioma:** identificadores en inglés, texto visible y nombres de test en español. Sin tildes ni letra eñe en nombres de ficheros.
- **Commits:** Conventional Commits en español, terminando con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
app/frontend/src/
├── pages/Consultas.tsx                          (modificar) exigir curso
├── pages/Consultas.test.tsx                     (nuevo)
├── components/charts/geometria.ts               (modificar) ancho de zona sensible
├── components/charts/charts.test.ts             (modificar) casos con muchos puntos
├── components/charts/LineaTendencia.tsx         (modificar) usar ese ancho
└── components/charts/BarrasPorCurso.tsx         (modificar) alto maximo y desplazamiento
```

---

## Task 1: La pantalla de consultas exige elegir un curso

**Files:**
- Modify: `app/frontend/src/pages/Consultas.tsx`
- Test: `app/frontend/src/pages/Consultas.test.tsx`

**Interfaces:**
- Consumes: `GET /api/reports/summary?grade=&from=&to=` y `GET /api/reports/excel?...`, sin cambios.
- Produces: nada nuevo.

**La descarga en Excel sigue permitiendo "todos los cursos"**, y debe seguir permitiéndolo: son 64 KB y es justo la herramienta para analizar el colegio entero. Lo que no tiene sentido es pintar 1.203 filas en una pantalla que nadie va a leer de corrido. La consulta en pantalla sirve para mirar **un curso**; el análisis global se hace en la hoja de cálculo.

El curso pasa de ser un campo de texto libre a un desplegable con los cursos que existen, sacados del propio resumen. Escribir "601" a mano y equivocarse devolvía una tabla vacía sin explicación.

- [ ] **Step 1: Escribir el test**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Consultas from './Consultas';

const FILAS = [
  { studentId: 1, documentId: '111', fullName: 'ANA LOPEZ', grade: '601',
    present: 18, late: 1, absent: 2, evasion: 0, schoolDays: 21 },
  { studentId: 2, documentId: '222', fullName: 'BETO RUIZ', grade: '601',
    present: 15, late: 3, absent: 2, evasion: 1, schoolDays: 21 },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Consultas', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'COORDINADOR',
      fullName: 'Coordinacion', userId: 2, mustChangePassword: false,
    }));
  });

  it('no consulta hasta que se elige un curso', async () => {
    const f = vi.fn(async () => respuesta(FILAS));
    vi.stubGlobal('fetch', f);
    render(<Consultas />);

    await userEvent.type(screen.getByLabelText(/desde/i), '2026-02-01');
    await userEvent.type(screen.getByLabelText(/hasta/i), '2026-06-30');

    // Con fechas pero sin curso, el boton de consultar sigue deshabilitado.
    expect(screen.getByRole('button', { name: /^consultar/i })).toBeDisabled();
    expect(f).not.toHaveBeenCalled();
  });

  it('explica por que hay que elegir un curso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(FILAS)));
    render(<Consultas />);
    expect(screen.getByText(/elija un curso/i)).toBeInTheDocument();
  });

  it('con curso y fechas si consulta y pinta las filas', async () => {
    const f = vi.fn(async () => respuesta(FILAS));
    vi.stubGlobal('fetch', f);
    render(<Consultas />);

    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await userEvent.type(screen.getByLabelText(/desde/i), '2026-02-01');
    await userEvent.type(screen.getByLabelText(/hasta/i), '2026-06-30');
    await userEvent.click(screen.getByRole('button', { name: /^consultar/i }));

    await waitFor(() => expect(screen.getByText('ANA LOPEZ')).toBeInTheDocument());
    expect(String(f.mock.calls[0][0])).toContain('grade=601');
  });

  it('la descarga en Excel si permite todos los cursos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(FILAS)));
    render(<Consultas />);
    await userEvent.type(screen.getByLabelText(/desde/i), '2026-02-01');
    await userEvent.type(screen.getByLabelText(/hasta/i), '2026-06-30');
    // Sin curso elegido, el Excel sigue disponible: 64 KB y es la herramienta
    // correcta para analizar el colegio entero.
    expect(screen.getByRole('button', { name: /excel/i })).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/frontend && npm test src/pages/Consultas.test.tsx`
Expected: FAIL — hoy el botón de consultar no depende del curso y el campo es de texto libre.

- [ ] **Step 3: Modificar `Consultas.tsx`**

Tres cambios. Primero, el estado y la lista de cursos:

```tsx
  const [cursos, setCursos] = useState<string[]>([]);

  // Los cursos salen de un resumen de un solo dia: es la consulta mas barata que
  // devuelve la lista completa, y evita inventar un endpoint nuevo para esto.
  useEffect(() => {
    const hoy = new Date().toLocaleDateString('en-CA');
    api.get<Fila[]>(`/api/reports/summary?from=${hoy}&to=${hoy}`)
       .then((filas) => setCursos([...new Set(filas.map((f) => f.grade))].sort()))
       .catch(() => {});   // sin conexion se queda vacio y el aviso lo explica
  }, []);
```

Segundo, el campo de curso pasa de texto libre a desplegable:

```tsx
        <label htmlFor="curso">Curso</label>
        <select id="curso" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">Elija un curso...</option>
          {cursos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
```

Tercero, el botón exige curso y aparece la explicación:

```tsx
      <p className="meta">
        Elija un curso para ver la tabla. Para analizar el colegio entero, descargue
        el Excel: 1.200 estudiantes no se leen en una pantalla.
      </p>
      <button type="button" onClick={() => void buscar()} disabled={!grade || !from || !to}>
        Consultar
      </button>
      <button type="button" className="secundario" onClick={() => void descargar()}
              disabled={!from || !to}>
        Descargar Excel{grade ? ` (${grade})` : ' (todos los cursos)'}
      </button>
```

Añadir `useEffect` al import de React si falta.

- [ ] **Step 4: Ejecutar los tests**

Run: `cd app/frontend && npm test`
Expected: PASS todo.

- [ ] **Step 5: Commit**

```bash
git add app/frontend/src/pages
git commit -m "fix: Consultas se traia los 1200 estudiantes de una vez

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Las zonas sensibles del gráfico de tendencia se solapaban

**Files:**
- Modify: `app/frontend/src/components/charts/geometria.ts`
- Modify: `app/frontend/src/components/charts/LineaTendencia.tsx`
- Test: `app/frontend/src/components/charts/charts.test.ts`

**Interfaces:**
- Consumes: `puntosLinea(serie, ancho, alto)`, sin cambios.
- Produces: `anchoZonaSensible(cantidadDePuntos, ancho): number` en `geometria.ts`.

Con un semestre son 86 días lectivos: los puntos quedan a unos 11 px y las zonas de toque miden 20 px fijos, así que **se solapan y tocar un día devuelve otro**. Con pocos días el problema es el contrario: zonas diminutas que el dedo no acierta.

La regla: la zona vale lo que separa a dos puntos, acotada entre 8 y 44 px. El mínimo evita zonas inservibles; el máximo evita que con tres puntos la zona ocupe un tercio del gráfico y se dispare el tooltip a medio camino.

- [ ] **Step 1: Escribir el test**

Añadir a `charts.test.ts`, y añadir `anchoZonaSensible` al import de `./geometria`:

```ts
  it('con muchos puntos las zonas sensibles no se solapan', () => {
    // Un semestre son 86 dias lectivos en 942 px utiles: los puntos quedan a ~11 px.
    const separacion = 942 / 85;
    const zona = anchoZonaSensible(86, 942);
    expect(zona).toBeLessThanOrEqual(separacion);
  });

  it('con pocos puntos la zona no se hace diminuta', () => {
    expect(anchoZonaSensible(3, 942)).toBeGreaterThanOrEqual(8);
  });

  it('con pocos puntos la zona tampoco se hace enorme', () => {
    // Sin tope, con 3 puntos la zona ocuparia un tercio del grafico.
    expect(anchoZonaSensible(3, 942)).toBeLessThanOrEqual(44);
  });

  it('con un solo punto devuelve algo tocable y finito', () => {
    const zona = anchoZonaSensible(1, 942);
    expect(zona).toBeGreaterThanOrEqual(8);
    expect(Number.isFinite(zona)).toBe(true);
  });

  it('nunca devuelve cero ni negativo', () => {
    for (const n of [0, 1, 2, 50, 200, 500]) {
      expect(anchoZonaSensible(n, 942)).toBeGreaterThan(0);
    }
  });
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/frontend && npm test src/components/charts/charts.test.ts`
Expected: FAIL — `anchoZonaSensible` no existe.

- [ ] **Step 3: Añadir la función a `geometria.ts`**

```ts
/**
 * Ancho de la zona sensible de cada punto de la linea.
 *
 * Con 86 dias lectivos los puntos quedan a ~11 px: una zona fija de 20 px se solapa
 * con la vecina y tocar un dia devuelve otro. Con pocos dias pasa lo contrario, asi
 * que se acota por los dos lados: minimo 8 px para que el dedo acierte, maximo 44 px
 * para que con tres puntos la zona no ocupe un tercio del grafico.
 */
export function anchoZonaSensible(puntos: number, ancho: number): number {
  if (puntos <= 1) return 44;
  const separacion = ancho / (puntos - 1);
  return Math.min(44, Math.max(8, separacion));
}
```

- [ ] **Step 4: Usarla en `LineaTendencia.tsx`**

Añadir `anchoZonaSensible` al import de `./geometria` y, antes del `return`:

```tsx
  const zona = anchoZonaSensible(puntos.length, anchoUtil);
```

Sustituir el rectángulo sensible de cada punto:

```tsx
              <rect x={p.x - zona / 2} y={0} width={zona} height={altoUtil} fill="transparent"
                    tabIndex={0} role="button"
                    aria-label={`${fecha(p.fecha)}: ${p.valor} por ciento`}
                    onMouseEnter={() => setActivo(i)} onFocus={() => setActivo(i)} />
```

- [ ] **Step 5: Ejecutar los tests**

Run: `cd app/frontend && npm test`
Expected: PASS todo.

- [ ] **Step 6: Commit**

```bash
git add app/frontend/src/components/charts
git commit -m "fix: con un semestre entero las zonas del grafico se solapaban

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: El gráfico de barras crecía sin límite

**Files:**
- Modify: `app/frontend/src/components/charts/BarrasPorCurso.tsx`
- Modify: `app/frontend/src/styles.css`

**Interfaces:**
- Consumes: `segmentosApilados`, sin cambios.
- Produces: nada nuevo.

Con 30 cursos el SVG mide 1.020 px de alto. No está roto, pero el usuario pierde de vista la leyenda y el título al desplazarse, y en un teléfono es una pared de barras. Se acota la altura visible y se deja desplazar por dentro, con la leyenda siempre a la vista.

Nada de paginar ni de virtualizar: 30 filas de SVG no son un problema de rendimiento, son un problema de encuadre.

- [ ] **Step 1: Acotar la altura en `BarrasPorCurso.tsx`**

Envolver el `<svg>` en un contenedor desplazable. Sustituir la apertura del `<svg>` por:

```tsx
        <div className="grafica-scroll">
        <svg viewBox={`0 0 1000 ${alto}`} width="100%" height={alto} role="img"
             aria-label={`Barras apiladas de asistencia por curso, ${datos.length} cursos`}>
```

y cerrar con `</svg></div>` donde antes solo cerraba `</svg>`.

- [ ] **Step 2: Añadir el estilo a `styles.css`**

```css
/* Con 30 cursos el SVG mide mas de 1000 px: se desplaza por dentro para que el
   titulo y la leyenda sigan a la vista. */
.grafica-scroll { max-height: 60vh; overflow-y: auto; }
```

- [ ] **Step 3: Anunciar cuántos cursos hay**

En la `<figcaption>`, para que quien mira sepa que la lista continúa:

```tsx
      <figcaption>
        Distribucion de registros en el periodo seleccionado
        {datos.length > 8 && ` · ${datos.length} cursos, desplace para ver todos`}
      </figcaption>
```

- [ ] **Step 4: Comprobar que compila y los tests siguen verdes**

Run: `cd app/frontend && npm test && npm run build`
Expected: PASS todo, paquete por debajo de 200 KB gzip.

- [ ] **Step 5: Mirarlo con datos reales**

Levantar el backend contra la base de carga y el frontend, entrar como coordinación y abrir el tablero:

```bash
cd app/backend && DB_URL=jdbc:postgresql://localhost:5432/asistencia_carga \
  DB_USER=postgres DB_PASSWORD=postgres SERVER_PORT=8082 mvn spring-boot:run
```

Comprobar con los 30 cursos y los 86 días:
1. El gráfico de barras se desplaza por dentro y la leyenda no se va.
2. En el de tendencia, tocar un día muestra **ese** día y no el vecino.
3. En Consultas, sin elegir curso el botón está deshabilitado y se explica por qué.
4. En un teléfono estrecho (DevTools, 360 px) nada desborda en horizontal.

El punto 2 es el que motivó la tarea: antes era imposible acertar un día concreto.

- [ ] **Step 6: Commit**

```bash
git add app/frontend
git commit -m "fix: el grafico de barras crecia sin limite con muchos cursos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Dejar las mediciones escritas

**Files:**
- Modify: `docs/INFORME-FINAL.md`
- Modify: `app/README.md`

- [ ] **Step 1: Documentar cómo reproducir la medición en `app/README.md`**

Añadir una sección tras "Tests":

```markdown
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
```

- [ ] **Step 2: Añadir la sección de mediciones al informe**

Insertar antes de "Lo que sigue faltando" la sección 6.g con la tabla de tiempos, la
validación del dimensionamiento (230 bytes por fila medidos contra 250 estimados) y
los tres arreglos de interfaz.

- [ ] **Step 3: Commit**

```bash
git add docs app/README.md
git commit -m "docs: mediciones con el volumen real del colegio

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fuera de alcance

Lo que la medición dice que **no** hay que hacer. Vale tanto como lo que sí:

1. **Optimizar consultas del backend.** Ninguna pasa de 355 ms con 620.748 registros, y la más pesada tarda 972 ms generando un Excel de 1.200 filas. El plan de ejecución elige un recorrido secuencial en el resumen del semestre completo, y **es lo correcto**: el rango cubre casi toda la tabla, un índice sería más lento.
2. **Índices nuevos.** Los 8 que hay resuelven las consultas reales. Añadir índices que nadie usa cuesta escrituras y espacio.
3. **Caché del tablero.** 163 ms para 30 días no justifica invalidación de caché, que es de las cosas más fáciles de hacer mal.
4. **Paginar el resumen en el servidor.** Con el filtro por curso, la consulta más grande devuelve 7,3 KB. La paginación resolvería un problema que ya no existe.
5. **Virtualizar la tabla o el gráfico.** 40 filas por curso y 30 barras no son un problema de rendimiento.
6. **Particionar `attendance` por año.** A 300 MB anuales, la tabla tarda años en pedir particionado. Cuando las consultas se noten, se particiona; hoy sería complejidad sin causa.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El desplegable de cursos sale de un resumen de un día | Sin datos ese día, la lista sale vacía | Se consulta a un solo día por barato; si molesta, se cambia por un endpoint propio de cursos |
| Exigir curso quita una capacidad a coordinación | No podrá ver el colegio entero en pantalla | Deliberado: para eso está el Excel, y 1.203 filas no se leen de corrido |
| La zona sensible acotada a 8 px | Con más de 120 días el dedo falla igual | El curso tiene 190 días lectivos; a partir de ahí habría que agrupar por semana, anotado como trabajo futuro |

## Self-review

**Cobertura.** Los tres hallazgos medidos tienen tarea: 1.203 filas en pantalla (Task 1), zonas sensibles solapadas (Task 2), gráfico sin límite de alto (Task 3). Las mediciones quedan escritas en la Task 4. Lo que se decidió no hacer está en "Fuera de alcance" con su motivo y su número.

**Sin marcadores de posición.** Cada paso trae el código o el comando exacto.

**Consistencia.** `anchoZonaSensible(puntos, ancho)` se declara en la Task 2 Step 3 y se usa en el Step 4 con `puntos.length` y `anchoUtil`, que son los nombres que ya existen en `LineaTendencia`. El tipo `Fila` de `Consultas.tsx` no cambia. La clase `.grafica-scroll` se declara en la Task 3 Step 2 y se usa en el Step 1.

**Lo más importante de este plan es lo que no contiene.** La tentación con "mejora todo" es tocar el backend, y la medición dice claramente que no hace falta: le sobra margen por un orden de magnitud. Los tres arreglos son de presentación y ninguno pasa de veinte líneas.
