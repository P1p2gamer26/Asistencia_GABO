# Lo que Destapó Probar el Offline de Verdad — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglar los dos defectos que apareció verificar el ciclo offline completo en un navegador real, con el horario real de un docente.

**Architecture:** Los dos son de la pantalla de toma de asistencia. El primero es de correctitud: el selector de bloques muestra opciones indistinguibles y elegir la equivocada guarda la asistencia contra el día equivocado; se arregla filtrando los bloques por el día de la fecha elegida. El segundo es de honestidad con el usuario: el estado de conexión se decide con `navigator.onLine`, que miente en el caso más común del colegio; se complementa con el resultado real de la última sincronización.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react.

**Spec:** Verificación del 22 de agosto de 2026 contra la base de carga, registrada en la sección 6.i de `docs/INFORME-FINAL.md`.

## Lo que se verificó, y por qué importa

Hasta ahora el offline solo estaba probado con tests unitarios y con dos estudiantes.
Se montó el escenario real —frontend compilado servido por Spring Boot, igual que en
producción, contra la base con 620.748 registros— y se recorrió el ciclo entero con un
docente que tiene 40 estudiantes y 5 bloques:

| Paso | Resultado |
|---|---|
| Entrar y descargar datos | 40 estudiantes, 5 bloques y 88 días de calendario en el teléfono |
| **Cortar la red y recargar** | La aplicación abre igual; la sesión sobrevive |
| Elegir curso, bloque y día lectivo | 160 botones: el curso completo, sin red |
| Marcar 3 faltas sin conexión | Encoladas en el dispositivo; el banner las cuenta |
| Restaurar la red y enviar | Cola a 0 y **3 filas en la base de datos** |

**La premisa del proyecto se sostiene.** Pero el recorrido destapó dos defectos que
ningún test había visto, y que solo aparecen con el horario real.

### 1. Los bloques del desplegable son indistinguibles

`docente1` da Ciencias en el grado 805, bloque 4, a las 09:00 — **los cinco días de la
semana**. El desplegable los etiqueta a todos igual:

```
4. Ciencias (09:00)
4. Ciencias (09:00)
4. Ciencias (09:00)
4. Ciencias (09:00)
4. Ciencias (09:00)
```

El docente no puede saber cuál elegir, y elegir el equivocado **guarda la asistencia
contra el bloque de otro día**: el informe la atribuye mal y `pending-today` sigue
marcando el bloque de hoy como pendiente. Es un defecto de correctitud, no de estética.
Era invisible con un solo bloque en los datos de prueba.

### 2. El estado de conexión miente en el caso más común del colegio

El banner decide con `navigator.onLine`. Al cortar la red en el navegador, las
peticiones fallaban (`Failed to fetch`) mientras `navigator.onLine` seguía en `true`,
y la pantalla mostraba *"3 registro(s) sin enviar"* en vez de *"Sin conexión"*.

Ese es exactamente el caso del colegio: **WiFi conectado sin internet real**.
`navigator.onLine` solo dice si hay una interfaz de red activa, no si se llega a
alguna parte. Los datos están a salvo —eso se comprobó—, pero al docente se le dice
que está conectado mientras nada sale.

## Global Constraints

- **El proyecto vive en `app/`.** Frontend: `cd app/frontend && npm test` y `npm run build`.
- **No se toca el backend.** Los dos defectos son de la interfaz.
- **`waitFor`, nunca `findByRole`,** para contenido que depende de un efecto asíncrono.
- **Sin dependencias nuevas.**
- **El paquete de producción debe seguir por debajo de 200 KB gzip** (hoy 100 KB).
- **Idioma:** identificadores en inglés, texto visible y nombres de test en español. Sin tildes ni letra eñe en nombres de ficheros.
- **Commits:** Conventional Commits en español, terminando con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
app/frontend/src/
├── pages/TomarAsistencia.tsx         (modificar) filtrar bloques por dia; estado de conexion
├── pages/TomarAsistencia.test.tsx    (modificar) casos nuevos
├── sync/engine.ts                    (modificar) exponer el resultado del ultimo intento
└── components/BannerEstado.tsx       (modificar) tercer estado: "sin salida"
```

---

## Task 1: El selector de bloques solo ofrece los del día elegido

**Files:**
- Modify: `app/frontend/src/pages/TomarAsistencia.tsx`
- Test: `app/frontend/src/pages/TomarAsistencia.test.tsx`

**Interfaces:**
- Consumes: `db.blocks` (campo `weekday`, 1 a 5), la fecha ya seleccionada en la pantalla.
- Produces: nada nuevo.

La pantalla ya tiene la fecha. Un bloque del martes no se puede marcar un lunes, así
que ofrecerlo es ofrecer un error. **Filtrar por el día de la fecha elegida** resuelve
las dos cosas a la vez: desaparecen los duplicados indistinguibles y desaparece la
posibilidad de elegir mal.

Se añade además el día al texto de la opción. Cuesta nada y ancla al docente en lo que
está haciendo, sobre todo cuando está poniéndose al día con un día anterior.

- [ ] **Step 1: Escribir los tests**

Añadir a `TomarAsistencia.test.tsx`. En el `beforeEach` existente, sustituir la carga de
bloques por una que reproduzca el caso real —el mismo bloque los cinco días—:

```tsx
    await db.blocks.bulkPut([
      { id: 1, grade: '601', weekday: 1, blockNo: 4, subject: 'Ciencias', startTime: '09:00' },
      { id: 2, grade: '601', weekday: 2, blockNo: 4, subject: 'Ciencias', startTime: '09:00' },
      { id: 3, grade: '601', weekday: 3, blockNo: 4, subject: 'Ciencias', startTime: '09:00' },
      { id: 4, grade: '602', weekday: 1, blockNo: 2, subject: 'Espanol', startTime: '07:20' },
    ]);
```

Y el calendario con dos días lectivos de distinto día de la semana:

```tsx
    await db.schoolDays.bulkPut([
      { calendarDate: '2026-08-17', dayType: 'LECTIVO' },   // lunes
      { calendarDate: '2026-08-18', dayType: 'LECTIVO' },   // martes
    ]);
```

Los tests nuevos:

```tsx
  it('solo ofrece los bloques del dia de la fecha elegida', async () => {
    render(<TomarAsistencia />);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');   // lunes
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');

    await waitFor(() => {
      const opciones = Array.from(
        screen.getByLabelText(/bloque/i).querySelectorAll('option'))
        .map((o) => o.value).filter(Boolean);
      // De los tres bloques de 601, solo el del lunes (id 1)
      expect(opciones).toEqual(['1']);
    });
  });

  it('al cambiar de dia cambian los bloques ofrecidos', async () => {
    render(<TomarAsistencia />);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');

    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-18');   // martes

    await waitFor(() => {
      const opciones = Array.from(
        screen.getByLabelText(/bloque/i).querySelectorAll('option'))
        .map((o) => o.value).filter(Boolean);
      expect(opciones).toEqual(['2']);
    });
  });

  it('nunca ofrece dos opciones con el mismo texto', async () => {
    render(<TomarAsistencia />);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');

    await waitFor(() => {
      const textos = Array.from(
        screen.getByLabelText(/bloque/i).querySelectorAll('option'))
        .map((o) => o.textContent ?? '').filter((t) => !t.includes('Seleccione'));
      // Este es el bug que motivo la tarea: cinco opciones "4. Ciencias (09:00)"
      // identicas, y elegir la equivocada guardaba la asistencia en otro dia.
      expect(new Set(textos).size).toBe(textos.length);
    });
  });

  it('la opcion dice tambien el dia', async () => {
    render(<TomarAsistencia />);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');

    await waitFor(() =>
      expect(screen.getByLabelText(/bloque/i)).toHaveTextContent(/lunes/i));
  });
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd app/frontend && npm test src/pages/TomarAsistencia.test.tsx`
Expected: FAIL. El primero devuelve `['1','2','3']` en vez de `['1']`, y el de textos
únicos falla con tres opciones idénticas: es exactamente el bug reproducido.

- [ ] **Step 3: Filtrar los bloques por el día de la fecha**

En `TomarAsistencia.tsx`, sustituir el `useMemo` de `bloquesDelGrado`:

```tsx
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/** Dia de la semana (1 lunes ... 7 domingo) de una fecha YYYY-MM-DD, en hora local. */
function diaDeLaSemana(fecha: string): number {
  const d = new Date(`${fecha}T00:00`).getDay();
  return d === 0 ? 7 : d;
}

  // Solo los bloques que ocurren el dia de la fecha elegida. Un bloque del martes no
  // se puede marcar un lunes, asi que ofrecerlo es ofrecer un error: el docente elegia
  // entre cinco opciones identicas y la equivocada guardaba la asistencia en otro dia.
  const bloquesDelGrado = useMemo(
    () => blocks
      .filter((b) => b.grade === grade && b.weekday === diaDeLaSemana(fecha))
      .sort((a, b) => a.blockNo - b.blockNo),
    [blocks, grade, fecha],
  );
```

Y la opción, para que diga el día:

```tsx
            <option key={b.id} value={b.id}>
              {b.blockNo}. {b.subject} ({b.startTime}) · {DIAS[b.weekday % 7]}
            </option>
```

- [ ] **Step 4: Limpiar el bloque elegido al cambiar de fecha**

Si el docente cambia de día con un bloque ya elegido, ese bloque puede no existir el día
nuevo y quedaría seleccionado un valor imposible. Añadir junto al efecto que recupera
las marcas:

```tsx
  useEffect(() => {
    // La lista de bloques depende del dia: si el elegido ya no esta, se limpia.
    if (blockId !== null && !bloquesDelGrado.some((b) => b.id === blockId)) {
      setBlockId(null);
    }
  }, [bloquesDelGrado, blockId]);
```

- [ ] **Step 5: Ejecutar los tests**

Run: `cd app/frontend && npm test`
Expected: PASS todo.

- [ ] **Step 6: Commit**

```bash
git add app/frontend/src/pages
git commit -m "fix: el selector ofrecia cinco bloques identicos e indistinguibles

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: El estado de conexión deja de mentir

**Files:**
- Modify: `app/frontend/src/sync/engine.ts`
- Modify: `app/frontend/src/components/BannerEstado.tsx`
- Modify: `app/frontend/src/pages/TomarAsistencia.tsx`
- Test: `app/frontend/src/components/BannerEstado.test.tsx`

**Interfaces:**
- Consumes: `flushOutbox()`, que ya distingue `OfflineError` de un error del servidor.
- Produces: `flushOutbox()` devuelve además `alcanzable: boolean`; `BannerEstado` acepta una prop `alcanzable` y muestra un tercer estado.

`navigator.onLine` solo dice si hay una interfaz de red activa, **no si se llega a
alguna parte**. En el colegio, con WiFi sin salida a internet, dice `true` mientras
todo falla. La verdad la tiene el último intento de sincronizar, que ya se hace cada
minuto: si falló por red, no hay salida, diga lo que diga el navegador.

Tres estados, no dos:

| Situación | Mensaje |
|---|---|
| Hay salida y no queda nada pendiente | *(sin banner)* |
| Hay salida y quedan registros | "N registro(s) sin enviar" + botón |
| **No hay salida** (avión, o WiFi sin internet) | "Sin conexion. La asistencia se guarda en el telefono." |

- [ ] **Step 1: Escribir los tests**

Añadir a `BannerEstado.test.tsx`:

```tsx
  it('sin salida a internet avisa, aunque el navegador se crea conectado', () => {
    // El caso del colegio: WiFi conectado, sin internet. navigator.onLine dice true.
    render(<BannerEstado online={true} alcanzable={false} pendientes={3}
                         onSincronizar={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(/sin conexion/i);
  });

  it('sin salida no ofrece el boton de enviar', () => {
    render(<BannerEstado online={true} alcanzable={false} pendientes={3}
                         onSincronizar={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('con salida y pendientes si ofrece enviar', () => {
    render(<BannerEstado online={true} alcanzable={true} pendientes={3}
                         onSincronizar={() => {}} />);
    expect(screen.getByRole('button', { name: /enviar ahora/i })).toBeInTheDocument();
  });

  it('con salida y nada pendiente no muestra nada', () => {
    const { container } = render(
      <BannerEstado online={true} alcanzable={true} pendientes={0} onSincronizar={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
```

Los tests que ya existen pasan `online` sin `alcanzable`: hay que añadirles
`alcanzable={props.online}` para que sigan describiendo el caso que describían.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd app/frontend && npm test src/components/BannerEstado.test.tsx`
Expected: FAIL — el componente no conoce `alcanzable`.

- [ ] **Step 3: Devolver el resultado real desde `flushOutbox`**

En `engine.ts`, ampliar el tipo de retorno y los tres puntos de salida:

```ts
export async function flushOutbox(): Promise<{ sent: number; pending: number; alcanzable: boolean }> {
  const records = await db.outbox.toArray();
  if (records.length === 0) return { sent: 0, pending: 0, alcanzable: true };

  let result: { accepted: number; rejected: { id: string; reason: string }[] };
  try {
    result = await api.post('/api/attendance/sync', {
      records: records.map(({ key, error, ...r }) => r),
    });
  } catch (e) {
    // OfflineError significa que la peticion no llego a ninguna parte. Es la unica
    // senal fiable: navigator.onLine dice true con WiFi sin internet, que es
    // exactamente lo que pasa en el colegio.
    if (e instanceof OfflineError) return { sent: 0, pending: records.length, alcanzable: false };
    throw e;
  }
  // ... el resto igual ...
  return { sent: result.accepted, pending: await pendingCount(), alcanzable: true };
}
```

En `startAutoSync`, propagar el dato:

```ts
export function startAutoSync(onChange?: (pending: number, alcanzable: boolean) => void) {
  const intentar = async () => {
    const r = await flushOutbox().catch(() => null);
    if (r) onChange?.(r.pending, r.alcanzable);
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

- [ ] **Step 4: Añadir el tercer estado a `BannerEstado`**

```tsx
type Props = {
  online: boolean;
  alcanzable: boolean;
  pendientes: number;
  onSincronizar: () => void;
};

export default function BannerEstado({ online, alcanzable, pendientes, onSincronizar }: Props) {
  // Sin salida cuenta tanto el modo avion (online false) como el WiFi sin internet
  // (online true, alcanzable false), que es el caso habitual en el colegio.
  const haySalida = online && alcanzable;

  if (haySalida && pendientes === 0) return null;

  return (
    <div className={haySalida ? 'banner pendiente' : 'banner offline'} role="status">
      {haySalida
        ? `${pendientes} registro(s) sin enviar`
        : 'Sin conexion. La asistencia se guarda en el telefono.'}
      {haySalida && pendientes > 0 && (
        <button type="button" onClick={onSincronizar}>Enviar ahora</button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Conectarlo en `TomarAsistencia.tsx`**

Añadir el estado y pasarlo:

```tsx
  const [alcanzable, setAlcanzable] = useState(true);
```

En el efecto de arranque, `startAutoSync((p, a) => { setPendientes(p); setAlcanzable(a); })`.

En `enviar()`, recoger también el dato:

```tsx
  async function enviar() {
    const { pending, alcanzable: hay } = await flushOutbox();
    setPendientes(pending);
    setAlcanzable(hay);
  }
```

Y en el JSX: `<BannerEstado online={online} alcanzable={alcanzable} pendientes={pendientes} onSincronizar={enviar} />`.

- [ ] **Step 6: Ejecutar los tests**

Run: `cd app/frontend && npm test`
Expected: PASS todo.

- [ ] **Step 7: Comprobarlo como se descubrió**

El defecto no se ve en modo desarrollo, porque **ahí no hay service worker**. Hay que
montar el escenario de producción:

```bash
cd app/frontend && npm run build
cp -r dist/* ../backend/src/main/resources/static/
cd ../backend && DB_URL=jdbc:postgresql://localhost:5432/asistencia \
  DB_USER=postgres DB_PASSWORD=postgres mvn spring-boot:run
```

Con `agent-browser`: entrar, "Actualizar datos", `agent-browser set offline on`,
recargar `/asistencia`, marcar asistencia. El banner debe decir **"Sin conexion"**, no
"N registro(s) sin enviar". Después `set offline off` y comprobar que sube.

**Borrar `app/backend/src/main/resources/static/` al terminar**: es salida de
compilación y no va al repositorio.

- [ ] **Step 8: Commit**

```bash
git add app/frontend
git commit -m "fix: el banner decia 'en linea' con WiFi sin internet

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Documentar cómo se prueba el offline de verdad

**Files:**
- Modify: `app/README.md`
- Modify: `docs/DESPLIEGUE.md`

Quien intente probar el offline con `npm run dev` va a concluir que está roto, porque
**en desarrollo no hay service worker**: al cortar la red sale el dinosaurio. Eso costó
un rato de diagnóstico y merece estar escrito.

- [ ] **Step 1: Añadir la sección a `app/README.md`**

```markdown
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
```

- [ ] **Step 2: Añadir la comprobación a `docs/DESPLIEGUE.md`**

En la lista de comprobaciones posteriores al despliegue, ampliar el punto del teléfono:

```markdown
3. **Desde un teléfono**: instalar la aplicación, pulsar "Actualizar datos", poner el
   aparato en **modo avión**, tomar la asistencia de un curso completo, quitar el modo
   avión y comprobar que los registros llegan. Probar también el caso más común del
   colegio: **conectado al WiFi pero sin internet** (desenchufar el router un momento).
   El banner debe decir "Sin conexion" en los dos casos.
```

- [ ] **Step 3: Commit**

```bash
git add app/README.md docs/DESPLIEGUE.md
git commit -m "docs: como probar el offline, que no funciona en modo desarrollo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fuera de alcance

1. **Sondear la conexión activamente** (un `ping` periódico al servidor). El intento de
   sincronización que ya corre cada minuto da la misma información sin gastar batería
   ni datos en peticiones que no llevan trabajo.
2. **Reintento con espera creciente.** Cada minuto es suficiente para el caso real y es
   predecible; una espera exponencial complica el código y confunde al docente que
   espera ver bajar el contador.
3. **Avisar al docente cuando la sincronización se recupera.** El contador bajando a
   cero ya lo dice. Una notificación más es ruido en mitad de una clase.
4. **Días institucionales A/B.** Sigue pendiente de que el colegio defina el modelo; el
   filtro por día de la semana que introduce la Task 1 es compatible con esa evolución.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Filtrar bloques por día oculta bloques que el docente esperaba ver | Podría creer que le falta horario | Es correcto: en esa fecha esos bloques no ocurren. La opción ahora dice el día, lo que lo hace evidente |
| `alcanzable` arranca en `true` | Al abrir sin red, el primer segundo dice que hay conexión | `startAutoSync` intenta sincronizar de inmediato, así que se corrige en el primer ciclo |
| Un error 500 del servidor no marca `alcanzable` en falso | Diría "sin enviar" en vez de "sin conexión" | Deliberado: el servidor respondió, hay salida. El problema es otro y confundirlo con falta de red sería peor |

## Self-review

**Cobertura.** Los dos defectos hallados tienen tarea: bloques indistinguibles (Task 1),
estado de conexión que miente (Task 2). La Task 3 documenta el escenario de prueba, sin
el cual nadie puede reproducir ninguno de los dos.

**Sin marcadores de posición.** Cada paso trae el código o el comando exacto.

**Consistencia.** `flushOutbox` devuelve `{sent, pending, alcanzable}` y los tres puntos
de retorno se actualizan; `startAutoSync` pasa `(pending, alcanzable)` y quien lo llama
recibe los dos. `BannerEstado` gana la prop `alcanzable` y los tests que ya existían se
ajustan en el Step 1 de la Task 2. `diaDeLaSemana` devuelve 1 a 7 igual que la columna
`weekday` de la base, que va de 1 a 5.

**Lo que más me costó ver.** El segundo defecto solo aparece si se corta la red **de
verdad**: con `navigator.onLine` simulado a `false` en un test, el código funciona
perfectamente. Hizo falta un navegador real, un service worker real y una red
realmente cortada para que la mentira se hiciera visible.
