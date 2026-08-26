# Offline de verdad y uso desde el celular — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un docente instale la aplicación en su celular, tome asistencia sin señal durante toda la jornada y que lo marcado suba solo en cuanto haya internet, sin que tenga que acordarse de nada.

**Architecture:** La base offline ya existe (Dexie con cola `outbox`, `flushOutbox`, service worker con Workbox) pero está a medias: el sincronizador solo corre mientras la pantalla de asistencia está abierta, la cola de portería vive aparte con su propio código, las pantallas de consulta quedan en blanco sin señal y el botón de instalar es código muerto que nadie renderiza. Este plan no reescribe nada: sube el sincronizador al nivel de la aplicación, unifica las dos colas en el mismo motor, cachea las lecturas para que las pantallas no queden vacías, y cierra la parte de móvil (instalación, iconos, marca de agua, versión visible).

**Tech Stack:** React 18 + Vite 5 + vite-plugin-pwa (Workbox) + Dexie 4 (IndexedDB) + Vitest + fake-indexeddb. Backend Spring Boot ya existente, sin cambios salvo un endpoint de versión.

**Spec:** No hay spec escrita. Sale del encargo del 2026-08-26: «que se pueda trabajar con o sin internet, cuando detecte internet el dispositivo sube la asistencia, se maneja desde el celular, la imagen de portada no se ve simétrica, hay que seguir mejorando la versión, y me gustaría ver el logo del colegio de fondo medio transparente». El inventario del código que respalda cada tarea está citado tarea por tarea.

## Global Constraints

- **Español sin tildes en código, comentarios y SQL.** Los textos de interfaz que ya existen conservan las tildes que tengan; no se añaden tildes nuevas en código.
- **Tests:** `cd app/frontend && npx vitest run` (línea base **186 en verde**) y `cd app/backend && mvn -o test` (línea base **187 en verde**). Ninguna tarea se commitea en rojo.
- **Backend en local:** `cd app/backend && DB_USER=postgres DB_PASSWORD=postgres mvn spring-boot:run`.
- **Ver un cambio de frontend en `localhost:8080`:** `bash tools/refrescar-web.sh`, y si `target/classes/static` está bloqueado porque el backend corre: `rm -rf app/backend/target/classes/static/assets && cp -r app/frontend/dist/. app/backend/target/classes/static/`. Después, recarga forzada (Ctrl+Shift+R): el service worker sirve el paquete anterior.
- **Producción sale de `main`:** Render despliega en cada push a esa rama y Flyway corre sus migraciones contra Supabase al arrancar. Este plan **no añade ninguna migración**. La base local se llama `asistencia`; la de producción, `postgres`.
- **`navigator.onLine` no sirve como señal de verdad:** dice `true` con WiFi del colegio sin salida a internet. La señal fiable es `OfflineError` de `api/client.ts`, que solo se lanza cuando el `fetch` no llegó a ninguna parte. Ya está así en `sync/engine.ts:52`; ninguna tarea puede sustituirla por `navigator.onLine`.
- **Nada de dependencias nuevas.** Todo lo de este plan sale de la plataforma (IndexedDB, Workbox ya instalado, CSS) o de lo que ya está en `package.json`.
- **Presupuesto de imágenes:** 30 KB por imagen que viaje en cada carga; `tools/generar-iconos.py` documenta las excepciones y sus límites en `LIMITES`.

---

## File Structure

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `app/frontend/src/sync/engine.ts` | motor único: cola de asistencia **y** de portería, backoff, `flushAll()` | 1, 2, 3 |
| `app/frontend/src/sync/useSincronizacion.ts` | **crear** — hook que corre en toda la app y expone pendientes/alcanzable | 1 |
| `app/frontend/src/components/Layout.tsx` | monta el sincronizador y la barra de estado global | 1 |
| `app/frontend/src/components/BarraOffline.tsx` | **crear** — franja fija con pendientes y edad de los datos | 1, 4 |
| `app/frontend/src/pages/Ingreso.tsx` | deja de tener su propio flush y usa el motor | 2 |
| `app/frontend/src/db/local.ts` | `version(2)` con migración que conserva las colas | 10 |
| `app/frontend/vite.config.ts` | caché de lecturas GET, manifest con iconos y capturas | 5, 7 |
| `app/frontend/src/api/cacheLectura.ts` | **crear** — guarda y devuelve la última respuesta buena de un GET | 5 |
| `app/frontend/src/components/BotonInstalar.tsx` | se renderiza de verdad y explica el caso de iPhone | 6 |
| `tools/generar-iconos.py` | genera `icon-maskable-512.png`, `apple-touch-icon.png` y la portada | 7 |
| `app/frontend/index.html` | apple-touch-icon correcto y color de fondo del arranque | 7 |
| `app/frontend/src/styles.css` | marca de agua del escudo, franja offline, portada simétrica | 7, 8 |
| `app/frontend/src/components/Version.tsx` | **crear** — versión visible y aviso de versión nueva | 9 |

---

### Task 1: El sincronizador vive en toda la aplicación, no en una pantalla

Hoy `startAutoSync` se llama **solo** en `TomarAsistencia.tsx:64`. Si el docente marca la lista y se va a Horario, cierra la pestaña o bloquea el teléfono, nada sincroniza hasta que vuelva a entrar a esa pantalla exacta. Es el agujero más grande del modo offline: los datos están a salvo en IndexedDB, pero pueden quedarse ahí días.

**Files:**
- Create: `app/frontend/src/sync/useSincronizacion.ts`
- Create: `app/frontend/src/sync/useSincronizacion.test.tsx`
- Create: `app/frontend/src/components/BarraOffline.tsx`
- Modify: `app/frontend/src/components/Layout.tsx`
- Modify: `app/frontend/src/pages/TomarAsistencia.tsx` (quitar su `startAutoSync` propio)
- Modify: `app/frontend/src/styles.css`

**Interfaces:**
- Consumes: `startAutoSync(onChange?: (pending: number, alcanzable: boolean) => void): () => void` y `pendingCount(): Promise<number>` de `../sync/engine`.
- Produces: `useSincronizacion(): { pendientes: number; alcanzable: boolean; sincronizarAhora: () => Promise<void> }` en `src/sync/useSincronizacion.ts`. La Task 3 le añade el reintento por visibilidad; la Task 4 le añade la edad de los datos.

- [ ] **Step 1: Escribir la prueba que falla**

Crea `app/frontend/src/sync/useSincronizacion.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/local';
import { useSincronizacion } from './useSincronizacion';

function Sonda() {
  const { pendientes, alcanzable } = useSincronizacion();
  return <p>pendientes={pendientes} alcanzable={String(alcanzable)}</p>;
}

describe('useSincronizacion', () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.schoolDays.clear();
    await db.schoolDays.bulkPut([{ calendarDate: '2026-07-13', dayType: 'LECTIVO' }]);
    vi.unstubAllGlobals();
  });

  it('cuenta lo que hay pendiente en la cola al montarse', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await db.outbox.put({
      key: '1:7:2026-07-13', id: 'u1', studentId: 1, scheduleBlockId: 7,
      classDate: '2026-07-13', status: 'P', recordedAt: '2026-07-13T12:00:00Z',
    });

    render(<Sonda />);
    await waitFor(() => expect(screen.getByText(/pendientes=1/)).toBeInTheDocument());
    expect(screen.getByText(/alcanzable=false/)).toBeInTheDocument();
  });

  it('cuando el servidor responde, vacia la cola sin que nadie pulse nada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ accepted: 1, rejected: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await db.outbox.put({
      key: '1:7:2026-07-13', id: 'u1', studentId: 1, scheduleBlockId: 7,
      classDate: '2026-07-13', status: 'P', recordedAt: '2026-07-13T12:00:00Z',
    });

    render(<Sonda />);
    await waitFor(() => expect(screen.getByText(/pendientes=0/)).toBeInTheDocument());
    expect(await db.outbox.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app/frontend && npx vitest run src/sync/useSincronizacion.test.tsx
```

Esperado: FALLA con `Failed to resolve import "./useSincronizacion"`.

- [ ] **Step 3: Escribir el hook**

Crea `app/frontend/src/sync/useSincronizacion.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { flushOutbox, pendingCount, startAutoSync } from './engine';

/**
 * Sincronizacion viva en toda la aplicacion.
 *
 * Antes esto se montaba solo dentro de la pantalla de asistencia: el docente marcaba
 * la lista, se iba a otra pantalla y la cola se quedaba en el telefono hasta que
 * volviera a entrar justo ahi. Los datos nunca se perdian, pero podian tardar dias
 * en llegar al colegio, que para una planilla de asistencia es casi lo mismo.
 */
export function useSincronizacion() {
  const [pendientes, setPendientes] = useState(0);
  const [alcanzable, setAlcanzable] = useState(true);

  useEffect(() => {
    void pendingCount().then(setPendientes);
    return startAutoSync((p, a) => { setPendientes(p); setAlcanzable(a); });
  }, []);

  const sincronizarAhora = useCallback(async () => {
    const r = await flushOutbox().catch(() => null);
    if (!r) return;
    setPendientes(r.pending);
    setAlcanzable(r.alcanzable);
  }, []);

  return { pendientes, alcanzable, sincronizarAhora };
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

```bash
npx vitest run src/sync/useSincronizacion.test.tsx
```

Esperado: 2 en verde.

- [ ] **Step 5: Crear la franja de estado**

Crea `app/frontend/src/components/BarraOffline.tsx`:

```tsx
import { useSincronizacion } from '../sync/useSincronizacion';

/**
 * Franja fija de estado. Solo aparece cuando hay algo que decir: en el caso normal
 * (todo enviado y servidor alcanzable) no ocupa un pixel.
 */
export default function BarraOffline() {
  const { pendientes, alcanzable, sincronizarAhora } = useSincronizacion();
  if (pendientes === 0 && alcanzable) return null;

  return (
    <div className={`barra-offline ${alcanzable ? '' : 'sin-red'}`} role="status">
      <span>
        {alcanzable
          ? `Enviando ${pendientes} marca${pendientes === 1 ? '' : 's'}...`
          : `Sin conexion. ${pendientes} marca${pendientes === 1 ? '' : 's'} guardada${pendientes === 1 ? '' : 's'} en el telefono.`}
      </span>
      <button type="button" className="secundario" onClick={() => void sincronizarAhora()}>
        Reintentar
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Montarla en el armazon**

En `app/frontend/src/components/Layout.tsx`, importa el componente y ponlo como primer hijo del contenedor que envuelve a `children`:

```tsx
import BarraOffline from './BarraOffline';
```

y dentro del JSX, justo antes de `{children}`:

```tsx
      <BarraOffline />
```

Añade al final de `app/frontend/src/styles.css`:

```css
/* Franja de estado offline: fija abajo para que se vea en el telefono sin subir. */
.barra-offline {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between; gap: var(--e2);
  padding: 8px var(--e3);
  background: var(--verde-oscuro); color: #fff; font-size: .9rem;
}
.barra-offline.sin-red { background: var(--ocre); color: #1b1b1b; }
.barra-offline button { min-height: 32px; padding: 4px 12px; }
```

- [ ] **Step 7: Quitar el sincronizador local de la pantalla de asistencia**

En `app/frontend/src/pages/TomarAsistencia.tsx`, dentro del primer `useEffect`, borra la línea:

```tsx
    const detener = startAutoSync((p, a) => { setPendientes(p); setAlcanzable(a); });
```

y en el `return` de ese efecto, borra `detener();`. Quita `startAutoSync` del `import` de `../sync/engine` (deja `flushOutbox`, `markAttendance`, `pendingCount`).

- [ ] **Step 8: Suite completa**

```bash
npx vitest run
```

Esperado: 186 + 2 = **188 en verde**. Si `TomarAsistencia.test.tsx` falla por el contador de pendientes, mira qué asserta: el contador de esa pantalla se sigue actualizando al marcar (`setPendientes(await pendingCount())` en `marcar`), solo desaparece el temporizador.

- [ ] **Step 9: Commit**

```bash
git add app/frontend/src/sync/useSincronizacion.ts \
        app/frontend/src/sync/useSincronizacion.test.tsx \
        app/frontend/src/components/BarraOffline.tsx \
        app/frontend/src/components/Layout.tsx \
        app/frontend/src/pages/TomarAsistencia.tsx \
        app/frontend/src/styles.css
git commit -m "Sincronizar en toda la aplicacion, no solo en la pantalla de asistencia

El sincronizador se montaba dentro de TomarAsistencia: al cambiar de pantalla
la cola se quedaba en el telefono hasta volver justo ahi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Una sola cola, un solo motor (la portería entra al mismo sitio)

`Ingreso.tsx` tiene su propio código de vaciado de `entryOutbox` (líneas 87-105): otra llamada a la API, otro manejo de rechazos, otro contador. Son dos implementaciones de la misma idea, y la de portería solo corre mientras esa pantalla está abierta — el mismo fallo que la Task 1 acaba de arreglar para asistencia.

**Files:**
- Modify: `app/frontend/src/sync/engine.ts`
- Modify: `app/frontend/src/sync/engine.test.ts`
- Modify: `app/frontend/src/pages/Ingreso.tsx`

**Interfaces:**
- Consumes: `db.entryOutbox` (tipo `OutboxEntry = { id, documentId, scannedAt, name?, error? }`) de `../db/local`.
- Produces: `flushEntries(): Promise<{ sent: number; pending: number; alcanzable: boolean; nombres: Record<string, string> }>` y `flushAll(): Promise<{ pending: number; alcanzable: boolean }>` en `sync/engine.ts`. `startAutoSync` pasa a usar `flushAll`, así que el hook de la Task 1 sincroniza las dos colas sin cambiar su firma.

- [ ] **Step 1: Mirar exactamente qué llama hoy la pantalla de portería**

```bash
sed -n 80,110p app/frontend/src/pages/Ingreso.tsx
```

Verificado al escribir este plan: la ruta es `/api/entry/sync`, el cuerpo va bajo la
clave **`entries`** (no `records`, que es la de asistencia) y la respuesta trae
`{ accepted, rejected, names }`. Confirma que sigue siendo asi antes de tocar el motor:
si el contrato cambio, manda lo que mande la pantalla hoy, byte por byte.

- [ ] **Step 2: Escribir la prueba que falla**

Añade a `app/frontend/src/sync/engine.test.ts`, dentro del `describe` existente:

```ts
  it('vaciar todo sube tambien la cola de porteria, no solo la de asistencia', async () => {
    await db.entryOutbox.clear();
    await db.entryOutbox.put({
      id: 'e1', documentId: '111', scannedAt: '2026-07-13T06:40:00Z',
    });
    await markAttendance({ ...base, status: 'P' });

    const enviados: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      enviados.push(new URL(url, 'http://x').pathname);
      return new Response(JSON.stringify({ accepted: 1, rejected: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const r = await flushAll();

    expect(enviados).toContain('/api/attendance/sync');
    expect(enviados.some((p) => p.startsWith('/api/entry'))).toBe(true);
    expect(r.pending).toBe(0);
    expect(await db.entryOutbox.count()).toBe(0);
  });

  it('sin red, ninguna de las dos colas se pierde', async () => {
    await db.entryOutbox.clear();
    await db.entryOutbox.put({
      id: 'e2', documentId: '222', scannedAt: '2026-07-13T06:41:00Z',
    });
    await markAttendance({ ...base, status: 'F' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));

    const r = await flushAll();

    expect(r.alcanzable).toBe(false);
    expect(r.pending).toBe(2);   // una marca + un ingreso
    expect(await db.entryOutbox.count()).toBe(1);
    expect(await pendingCount()).toBe(1);
  });
```

Y añade `flushAll` al import de la primera línea del fichero:

```ts
import { markAttendance, flushOutbox, flushAll, pendingCount, downloadBootstrap } from './engine';
```

- [ ] **Step 3: Ejecutar y ver que falla**

```bash
cd app/frontend && npx vitest run src/sync/engine.test.ts
```

Esperado: FALLA con `flushAll is not a function`.

- [ ] **Step 4: Implementar en el motor**

Añade a `app/frontend/src/sync/engine.ts`, después de `flushOutbox`. Sustituye la ruta y el cuerpo por los que anotaste en el Step 1:

```ts
/**
 * Sube los carnes escaneados en porteria. Vive aqui y no en la pantalla de Ingreso
 * porque una cola que solo se vacia con su pantalla abierta no es una cola offline:
 * es un formulario con memoria.
 */
export async function flushEntries(): Promise<{
  sent: number; pending: number; alcanzable: boolean; nombres: Record<string, string>;
}> {
  const cola = await db.entryOutbox.toArray();
  if (cola.length === 0) return { sent: 0, pending: 0, alcanzable: true, nombres: {} };

  // El contrato es `entries` (no `records` como en asistencia) y la respuesta trae
  // `names`: la porteria escanea un carne y necesita ver de quien es al confirmarlo.
  let result: {
    accepted: number;
    rejected: { id: string; reason: string }[];
    names: Record<string, string>;
  };
  try {
    result = await api.post('/api/entry/sync', {
      entries: cola.map(({ error, name, ...e }) => e),
    });
  } catch (e) {
    if (e instanceof OfflineError) {
      return { sent: 0, pending: cola.length, alcanzable: false, nombres: {} };
    }
    throw e;
  }

  const rechazados = new Map(result.rejected.map((r) => [r.id, r.reason]));
  await db.transaction('rw', db.entryOutbox, async () => {
    for (const e of cola) {
      const motivo = rechazados.get(e.id);
      if (motivo) await db.entryOutbox.update(e.id, { error: motivo });
      else await db.entryOutbox.delete(e.id);
    }
  });

  return {
    sent: result.accepted,
    pending: await db.entryOutbox.count(),
    alcanzable: true,
    nombres: result.names ?? {},
  };
}

/** Las dos colas de una pasada. Es lo que llama el sincronizador automatico. */
export async function flushAll(): Promise<{ pending: number; alcanzable: boolean }> {
  const marcas = await flushOutbox();
  const ingresos = await flushEntries();
  return {
    pending: marcas.pending + ingresos.pending,
    alcanzable: marcas.alcanzable && ingresos.alcanzable,
  };
}
```

Y en `startAutoSync`, cambia la línea `const r = await flushOutbox().catch(() => null);` por:

```ts
    const r = await flushAll().catch(() => null);
```

- [ ] **Step 5: Ejecutar**

```bash
npx vitest run src/sync/engine.test.ts
```

Esperado: 11 en verde. Si el nombre del endpoint no coincide con el que anotaste en el Step 1, la prueba `enviados.some((p) => p.startsWith('/api/entry'))` falla: corrige el motor, no la prueba.

- [ ] **Step 6: Que la pantalla de porteria use el motor**

En `app/frontend/src/pages/Ingreso.tsx`, borra el cuerpo de su función de vaciado propia y llama al motor. Importa:

```tsx
import { flushEntries } from '../sync/engine';
```

y sustituye el cuerpo de la función que hoy hace el `fetch` a mano por:

```tsx
    const r = await flushEntries();
    setPendientes(r.pending);
    return { nombres: r.nombres, rechazos: {}, alcanzable: r.alcanzable };
```

**Ojo con los rechazos:** la pantalla los usa para pintar el carne que el servidor no
acepto. `flushEntries` ya los deja escritos en `entryOutbox.error`, asi que si la
pantalla los necesita en memoria, leelos de la cola despues del vaciado:

```tsx
    const conError = await db.entryOutbox.toArray();
    const rechazos = Object.fromEntries(
      conError.filter((e) => e.error).map((e) => [e.id, e.error!]));
```

Deja intacto todo lo demás de la pantalla (escaneo, avisos, lista).

- [ ] **Step 7: Suite completa**

```bash
npx vitest run
```

Esperado: 190 en verde. Si `Ingreso.test.tsx` falla, mira si espera el `fetch` con una forma de cuerpo distinta: el motor debe mandar exactamente lo que mandaba la pantalla.

- [ ] **Step 8: Commit**

```bash
git add app/frontend/src/sync/engine.ts app/frontend/src/sync/engine.test.ts \
        app/frontend/src/pages/Ingreso.tsx
git commit -m "Subir la cola de porteria por el mismo motor que la de asistencia

Eran dos implementaciones de la misma idea, y la de porteria solo corria con
su pantalla abierta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Reintentar cuando el celular vuelve, no cada minuto a ciegas

`startAutoSync` reintenta con `setInterval` cada 60 segundos. En un celular eso no funciona bien: al bloquear la pantalla el navegador congela los temporizadores, y al desbloquear puede tardar un minuto entero en intentarlo. Al revés, sin señal machaca la radio cada minuto durante horas y se come la batería.

**Files:**
- Modify: `app/frontend/src/sync/engine.ts`
- Modify: `app/frontend/src/sync/engine.test.ts`

**Interfaces:**
- Consumes: `flushAll()` de la Task 2.
- Produces: `startAutoSync` con la misma firma — `(onChange?: (pending: number, alcanzable: boolean) => void) => () => void`. Nadie más cambia.

- [ ] **Step 1: Escribir la prueba que falla**

Añade a `app/frontend/src/sync/engine.test.ts`:

```ts
  it('reintenta en cuanto la pantalla vuelve a estar visible', async () => {
    await markAttendance({ ...base, status: 'P' });
    let intentos = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      intentos++;
      throw new TypeError('network');
    }));

    const detener = startAutoSync();
    await vi.waitFor(() => expect(intentos).toBeGreaterThanOrEqual(1));
    const tras_montar = intentos;

    // Desbloquear el telefono: es cuando de verdad puede haber vuelto la señal.
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(intentos).toBeGreaterThan(tras_montar));

    detener();
  });

  it('sin nada pendiente no toca la red', async () => {
    await db.outbox.clear();
    await db.entryOutbox.clear();
    let intentos = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { intentos++; throw new TypeError('network'); }));

    const detener = startAutoSync();
    await new Promise((r) => setTimeout(r, 50));
    detener();

    // Una cola vacia no justifica encender la radio del telefono.
    expect(intentos).toBe(0);
  });
```

Añade `startAutoSync` al import de la primera línea:

```ts
import { markAttendance, flushOutbox, flushAll, pendingCount, startAutoSync, downloadBootstrap } from './engine';
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app/frontend && npx vitest run src/sync/engine.test.ts
```

Esperado: FALLA la de `visibilitychange` (hoy solo escucha `online` y el temporizador). La de "sin nada pendiente" también falla: hoy llama a `flushOutbox` siempre, que sale antes de tocar la red solo si la cola está vacía — compruébalo, si ya pasa, déjala como prueba de caracterización.

- [ ] **Step 3: Implementar la espera creciente y los disparadores buenos**

Sustituye la función `startAutoSync` completa de `app/frontend/src/sync/engine.ts` por:

```ts
/**
 * Sincronizacion automatica de las dos colas.
 *
 * Los disparadores son los tres momentos en que de verdad puede haber cambiado algo:
 * al montar, cuando el navegador dice que volvio la red, y cuando la pantalla se
 * vuelve a ver (que en un celular es el desbloqueo, con los temporizadores congelados
 * hasta ese instante).
 *
 * La espera entre reintentos crece de 30 s a 5 min: sin señal, insistir cada minuto
 * durante una jornada entera se come la bateria sin conseguir nada. Vuelve al minimo
 * en cuanto un intento llega al servidor.
 */
export function startAutoSync(onChange?: (pending: number, alcanzable: boolean) => void) {
  const MIN = 30_000;
  const MAX = 300_000;
  let espera = MIN;
  let timer = 0;
  let vivo = true;

  const programar = () => {
    window.clearTimeout(timer);
    if (!vivo) return;
    timer = window.setTimeout(intentar, espera);
  };

  const intentar = async () => {
    if (!vivo) return;
    const hay = (await db.outbox.count()) + (await db.entryOutbox.count());
    // Una cola vacia no justifica encender la radio del telefono.
    if (hay === 0) { espera = MIN; programar(); return; }

    const r = await flushAll().catch(() => null);
    if (r) {
      espera = r.alcanzable ? MIN : Math.min(espera * 2, MAX);
      onChange?.(r.pending, r.alcanzable);
    }
    programar();
  };

  const alVolver = () => { espera = MIN; void intentar(); };
  const alVerse = () => { if (document.visibilityState === 'visible') alVolver(); };

  window.addEventListener('online', alVolver);
  document.addEventListener('visibilitychange', alVerse);
  void intentar();

  return () => {
    vivo = false;
    window.clearTimeout(timer);
    window.removeEventListener('online', alVolver);
    document.removeEventListener('visibilitychange', alVerse);
  };
}
```

- [ ] **Step 4: Ejecutar**

```bash
npx vitest run src/sync/engine.test.ts
```

Esperado: 13 en verde. Si la prueba de visibilidad no ve el segundo intento, comprueba que jsdom tiene `document.visibilityState === 'visible'` por defecto: lo tiene, y por eso `alVerse` dispara.

- [ ] **Step 5: Suite completa**

```bash
npx vitest run
```

Esperado: 192 en verde.

- [ ] **Step 6: Commit**

```bash
git add app/frontend/src/sync/engine.ts app/frontend/src/sync/engine.test.ts
git commit -m "Reintentar al desbloquear el telefono y espaciar los reintentos sin red

El temporizador fijo de 60 s se congela con la pantalla bloqueada y, sin
señal, machaca la radio toda la jornada sin conseguir nada.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Que se vea si los datos locales sirven para trabajar hoy

`downloadBootstrap()` se llama al montar el menú y su fallo se traga en silencio (`.catch(() => {})`). Un docente puede llegar al salón sin señal, abrir la aplicación y encontrarse las listas vacías **sin saber por qué**: nunca se descargaron, o se descargaron hace tres semanas y le falta media clase nueva.

**Files:**
- Modify: `app/frontend/src/sync/engine.ts`
- Modify: `app/frontend/src/sync/engine.test.ts`
- Modify: `app/frontend/src/components/BarraOffline.tsx`
- Modify: `app/frontend/src/components/Menu.tsx`

**Interfaces:**
- Consumes: `db.meta` (clave `lastBootstrap`, valor ISO-8601) que ya escribe `downloadBootstrap`.
- Produces: `estadoDeDatos(): Promise<{ descargado: string | null; dias: number | null; estudiantes: number }>` en `sync/engine.ts`.

- [ ] **Step 1: Escribir la prueba que falla**

Añade a `app/frontend/src/sync/engine.test.ts`:

```ts
  it('dice cuando se descargaron los datos y cuantos estudiantes hay', async () => {
    await db.meta.clear();
    await db.students.clear();
    await db.students.bulkPut([
      { id: 1, documentId: '111', fullName: 'ANA LOPEZ', grade: '6A' },
      { id: 2, documentId: '222', fullName: 'BETO RUIZ', grade: '6A' },
    ]);
    const haceDosDias = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await db.meta.put({ key: 'lastBootstrap', value: haceDosDias });

    const e = await estadoDeDatos();
    expect(e.estudiantes).toBe(2);
    expect(e.dias).toBe(2);
  });

  it('sin ninguna descarga previa lo dice en vez de fingir que hay datos', async () => {
    await db.meta.clear();
    await db.students.clear();

    const e = await estadoDeDatos();
    expect(e.descargado).toBeNull();
    expect(e.dias).toBeNull();
    expect(e.estudiantes).toBe(0);
  });
```

Añade `estadoDeDatos` al import de la primera línea del fichero.

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app/frontend && npx vitest run src/sync/engine.test.ts
```

Esperado: FALLA con `estadoDeDatos is not a function`.

- [ ] **Step 3: Implementar**

Añade a `app/frontend/src/sync/engine.ts`:

```ts
/**
 * Que tan util es la copia local ahora mismo. Sin esto, un docente sin señal ve las
 * listas vacias y no puede distinguir "no descargue nunca" de "el curso esta vacio".
 */
export async function estadoDeDatos(): Promise<{
  descargado: string | null; dias: number | null; estudiantes: number;
}> {
  const meta = await db.meta.get('lastBootstrap');
  const estudiantes = await db.students.count();
  if (!meta?.value) return { descargado: null, dias: null, estudiantes };

  const dias = Math.floor((Date.now() - new Date(meta.value).getTime()) / 86_400_000);
  return { descargado: meta.value, dias, estudiantes };
}
```

- [ ] **Step 4: Ejecutar**

```bash
npx vitest run src/sync/engine.test.ts
```

Esperado: 15 en verde.

- [ ] **Step 5: Avisar en la franja cuando los datos no sirven**

En `app/frontend/src/components/BarraOffline.tsx`, añade el estado de los datos:

```tsx
import { useEffect, useState } from 'react';
import { estadoDeDatos } from '../sync/engine';
import { useSincronizacion } from '../sync/useSincronizacion';

export default function BarraOffline() {
  const { pendientes, alcanzable, sincronizarAhora } = useSincronizacion();
  const [datos, setDatos] = useState<{ dias: number | null; estudiantes: number } | null>(null);

  useEffect(() => {
    void estadoDeDatos().then((e) => setDatos({ dias: e.dias, estudiantes: e.estudiantes }));
  }, [pendientes]);

  // Sin copia local no se puede tomar lista: es mas grave que tener cola pendiente.
  const sinDatos = datos !== null && datos.estudiantes === 0;
  const datosViejos = datos !== null && datos.dias !== null && datos.dias >= 7;

  if (pendientes === 0 && alcanzable && !sinDatos && !datosViejos) return null;

  const mensaje = sinDatos
    ? 'No hay datos descargados en este telefono: conectese una vez para poder tomar lista sin señal.'
    : datosViejos
      ? `Los datos del colegio se descargaron hace ${datos!.dias} dias. Conectese para actualizarlos.`
      : alcanzable
        ? `Enviando ${pendientes} marca${pendientes === 1 ? '' : 's'}...`
        : `Sin conexion. ${pendientes} marca${pendientes === 1 ? '' : 's'} guardada${pendientes === 1 ? '' : 's'} en el telefono.`;

  return (
    <div className={`barra-offline ${alcanzable && !sinDatos ? '' : 'sin-red'}`} role="status">
      <span>{mensaje}</span>
      <button type="button" className="secundario" onClick={() => void sincronizarAhora()}>
        Reintentar
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Que el fallo de la descarga deje de ser invisible**

En `app/frontend/src/components/Menu.tsx`, el efecto que descarga hoy es:

```tsx
  useEffect(() => { void downloadBootstrap().catch(() => {}); }, []);
```

Cámbialo por:

```tsx
  // Si falla, no se avisa aqui: la franja de estado ya dice si la copia local sirve o
  // no, que es lo que el docente necesita saber. Tragarse el error sin mas dejaba la
  // aplicacion vacia y muda.
  useEffect(() => {
    void downloadBootstrap().catch(() => {
      // Sin conexion es lo normal al abrir en el salon; lo anormal lo dice BarraOffline.
    });
  }, []);
```

- [ ] **Step 7: Suite completa y prueba en el navegador**

```bash
npx vitest run
cd .. && bash tools/refrescar-web.sh
```

Abre `localhost:8080` en una ventana nueva, entra, y en DevTools › Application › IndexedDB borra `ggm-asistencia`. Recarga con la red desconectada (DevTools › Network › Offline): debe verse la franja *"No hay datos descargados en este telefono..."*.

- [ ] **Step 8: Commit**

```bash
git add app/frontend/src/sync/engine.ts app/frontend/src/sync/engine.test.ts \
        app/frontend/src/components/BarraOffline.tsx app/frontend/src/components/Menu.tsx
git commit -m "Decir si la copia local sirve para trabajar hoy

Un docente sin señal veia las listas vacias sin poder distinguir "nunca
descargue" de "el curso esta vacio".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Las pantallas de consulta no quedan en blanco sin señal

`vite.config.ts:36` cachea la API como `NetworkOnly`: sin señal, `/consultas`, `/dashboard`, el inicio y el panel de últimos llamados muestran un error y nada más. Tomar lista funciona offline, pero *mirar* lo de ayer no. Las lecturas son idempotentes y no tienen por qué ser exactas para servir: valen si dicen de cuándo son.

**Files:**
- Create: `app/frontend/src/api/cacheLectura.ts`
- Create: `app/frontend/src/api/cacheLectura.test.ts`
- Modify: `app/frontend/src/api/client.ts`

**Interfaces:**
- Consumes: `db.meta` de `../db/local` (tabla `{ key: string; value: string }`).
- Produces: `guardarLectura(path: string, datos: unknown): Promise<void>` y `ultimaLectura<T>(path: string): Promise<{ datos: T; cuando: string } | null>`.

- [ ] **Step 1: Escribir la prueba que falla**

Crea `app/frontend/src/api/cacheLectura.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/local';
import { guardarLectura, ultimaLectura } from './cacheLectura';

describe('cache de lecturas', () => {
  beforeEach(async () => { await db.meta.clear(); });

  it('devuelve lo ultimo que respondio bien el servidor', async () => {
    await guardarLectura('/api/reports/today', { mesAsistencia: 99 });
    const guardado = await ultimaLectura<{ mesAsistencia: number }>('/api/reports/today');
    expect(guardado?.datos.mesAsistencia).toBe(99);
    expect(guardado?.cuando).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('una ruta que nunca respondio no inventa datos', async () => {
    expect(await ultimaLectura('/api/reports/novedades')).toBeNull();
  });

  it('cada ruta se guarda por separado', async () => {
    await guardarLectura('/api/a', { v: 1 });
    await guardarLectura('/api/b', { v: 2 });
    expect((await ultimaLectura<{ v: number }>('/api/a'))?.datos.v).toBe(1);
    expect((await ultimaLectura<{ v: number }>('/api/b'))?.datos.v).toBe(2);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app/frontend && npx vitest run src/api/cacheLectura.test.ts
```

Esperado: FALLA con `Failed to resolve import "./cacheLectura"`.

- [ ] **Step 3: Implementar**

Crea `app/frontend/src/api/cacheLectura.ts`:

```ts
import { db } from '../db/local';

/**
 * Ultima respuesta buena de cada GET, para poder pintar algo sin señal.
 *
 * Vive en la misma tabla `meta` de Dexie y no en la Cache API del service worker
 * porque asi se puede decir de CUANDO son los datos, que es la diferencia entre
 * "informacion vieja" y "informacion falsa". El service worker nunca cachea /api:
 * una respuesta de asistencia servida como si fuera de ahora seria mentir.
 */
const clave = (path: string) => `lectura:${path}`;

export async function guardarLectura(path: string, datos: unknown): Promise<void> {
  await db.meta.put({
    key: clave(path),
    value: JSON.stringify({ cuando: new Date().toISOString(), datos }),
  });
}

export async function ultimaLectura<T>(path: string): Promise<{ datos: T; cuando: string } | null> {
  const fila = await db.meta.get(clave(path));
  if (!fila?.value) return null;
  try {
    return JSON.parse(fila.value) as { datos: T; cuando: string };
  } catch {
    // Un valor corrupto no puede tumbar una pantalla: se trata como si no hubiera.
    return null;
  }
}
```

- [ ] **Step 4: Ejecutar**

```bash
npx vitest run src/api/cacheLectura.test.ts
```

Esperado: 3 en verde.

- [ ] **Step 5: Escribir la prueba de integracion con el cliente**

Añade a `app/frontend/src/api/cacheLectura.test.ts`:

```ts
import { api, OfflineError } from './client';

describe('api.get con respaldo local', () => {
  beforeEach(async () => {
    await db.meta.clear();
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ADMIN', fullName: 'A', userId: 1,
      mustChangePassword: false,
    }));
  });

  it('sin red devuelve lo ultimo bueno en vez de reventar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ v: 7 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));
    expect(await api.get<{ v: number }>('/api/reports/today')).toEqual({ v: 7 });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    expect(await api.get<{ v: number }>('/api/reports/today')).toEqual({ v: 7 });
  });

  it('sin red y sin nada guardado sigue lanzando OfflineError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await expect(api.get('/api/reports/nunca-pedido')).rejects.toBeInstanceOf(OfflineError);
  });
});
```

Añade `vi` al import de vitest de la primera línea del fichero.

- [ ] **Step 6: Ejecutar y ver que falla**

```bash
npx vitest run src/api/cacheLectura.test.ts
```

Esperado: FALLA la primera (hoy el segundo `api.get` lanza `OfflineError`).

- [ ] **Step 7: Conectarlo en el cliente**

En `app/frontend/src/api/client.ts`, localiza el objeto `api` y su método `get`. Envuélvelo así (ajusta al nombre real de la función interna, que es `request`):

```ts
import { guardarLectura, ultimaLectura } from './cacheLectura';
```

```ts
  get: async <T>(path: string): Promise<T> => {
    try {
      const datos = await request<T>(path, { method: 'GET' });
      // Solo se guarda lo que el servidor confirmo: nunca se cachea un error.
      void guardarLectura(path, datos);
      return datos;
    } catch (e) {
      if (!(e instanceof OfflineError)) throw e;
      const guardado = await ultimaLectura<T>(path);
      if (!guardado) throw e;   // sin respaldo, la pantalla debe decir que no hay datos
      return guardado.datos;
    }
  },
```

- [ ] **Step 8: Ejecutar y suite completa**

```bash
npx vitest run src/api/cacheLectura.test.ts
npx vitest run
```

Esperado: 5 en verde en el fichero y **199 en verde** en total. Si alguna prueba de pantalla empieza a pasar donde antes esperaba un error, es porque ahora hay respaldo: revisa si esa prueba limpiaba `db.meta` en su `beforeEach`; si no, añádelo.

- [ ] **Step 9: Commit**

```bash
git add app/frontend/src/api/cacheLectura.ts app/frontend/src/api/cacheLectura.test.ts \
        app/frontend/src/api/client.ts
git commit -m "Guardar la ultima lectura buena de cada GET para poder ver algo sin señal

Tomar lista ya funcionaba offline, pero mirar lo de ayer no: consultas,
tablero e inicio quedaban en blanco.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Que se pueda instalar en el celular de verdad

`BotonInstalar.tsx` existe, funciona y **no se renderiza en ninguna parte**: `grep -rn "BotonInstalar" src/` solo encuentra su propia definición. Es decir, hoy nadie puede instalar la aplicación desde dentro de la aplicación. En iPhone además no existe `beforeinstallprompt`: hay que decirle a la persona qué botón pulsar.

**Files:**
- Modify: `app/frontend/src/components/BotonInstalar.tsx`
- Create: `app/frontend/src/components/BotonInstalar.test.tsx`
- Modify: `app/frontend/src/pages/Login.tsx`
- Modify: `app/frontend/src/styles.css`

**Interfaces:**
- Consumes: el evento `beforeinstallprompt` del navegador.
- Produces: el componente `BotonInstalar` (export default), sin props.

- [ ] **Step 1: Escribir la prueba que falla**

Crea `app/frontend/src/components/BotonInstalar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BotonInstalar from './BotonInstalar';

function dispararPrompt() {
  const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void> };
  e.prompt = vi.fn(async () => {});
  window.dispatchEvent(e);
  return e;
}

describe('BotonInstalar', () => {
  it('en un navegador que puede instalar, ofrece instalar', async () => {
    render(<BotonInstalar />);
    const evento = dispararPrompt();
    const boton = await screen.findByRole('button', { name: /instalar/i });
    await userEvent.click(boton);
    expect(evento.prompt).toHaveBeenCalled();
  });

  it('en iPhone no hay evento, asi que explica como se hace a mano', () => {
    // Safari no implementa beforeinstallprompt: sin este texto, en iPhone no hay
    // ninguna pista de que la aplicacion se puede instalar.
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'iPhone Safari' });
    render(<BotonInstalar />);
    expect(screen.getByText(/compartir/i)).toBeInTheDocument();
    expect(screen.getByText(/pantalla de inicio/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app/frontend && npx vitest run src/components/BotonInstalar.test.tsx
```

Esperado: FALLA la de iPhone (hoy el componente devuelve `null` sin evento).

- [ ] **Step 3: Implementar**

Sustituye `app/frontend/src/components/BotonInstalar.tsx` por:

```tsx
import { useEffect, useState } from 'react';

type PromptEvent = Event & { prompt: () => Promise<void> };

const esIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Instalar la aplicacion en el telefono. Es la unica forma de que funcione bien sin
 * señal: instalada arranca desde el service worker, sin depender de que el navegador
 * conserve la pestaña.
 *
 * En iPhone no existe beforeinstallprompt, asi que no hay boton posible: lo unico
 * util es decir donde esta la opcion en Safari.
 */
export default function BotonInstalar() {
  const [evento, setEvento] = useState<PromptEvent | null>(null);
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    const capturar = (e: Event) => { e.preventDefault(); setEvento(e as PromptEvent); };
    const yaEsta = () => setInstalada(true);
    window.addEventListener('beforeinstallprompt', capturar);
    window.addEventListener('appinstalled', yaEsta);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturar);
      window.removeEventListener('appinstalled', yaEsta);
    };
  }, []);

  // Ya abierta como aplicacion instalada: ofrecer instalarla otra vez es ruido.
  if (instalada || window.matchMedia?.('(display-mode: standalone)').matches) return null;

  if (evento) {
    return (
      <div className="instalar">
        <button type="button" onClick={() => { void evento.prompt(); setEvento(null); }}>
          Instalar en el telefono
        </button>
        <small className="meta">Instalada funciona sin señal y arranca mas rapido.</small>
      </div>
    );
  }

  if (esIOS()) {
    return (
      <p className="instalar meta">
        Para usarla sin señal: pulse <strong>Compartir</strong> en Safari y luego{' '}
        <strong>Anadir a pantalla de inicio</strong>.
      </p>
    );
  }

  return null;
}
```

- [ ] **Step 4: Ejecutar**

```bash
npx vitest run src/components/BotonInstalar.test.tsx
```

Esperado: 2 en verde.

- [ ] **Step 5: Renderizarlo donde se ve**

En `app/frontend/src/pages/Login.tsx`, importa:

```tsx
import BotonInstalar from '../components/BotonInstalar';
```

y ponlo justo después del `<button type="submit">`, antes de cerrar el `</form>`:

```tsx
      <BotonInstalar />
```

El login es el sitio correcto: es la única pantalla que ve alguien que todavía no ha entrado, y es donde llega quien abre el enlace por primera vez desde el celular.

Añade al final de `app/frontend/src/styles.css`:

```css
/* Bloque de instalacion en el login: separado del boton de entrar para que nadie
   pulse "Instalar" creyendo que es "Entrar". */
.instalar { margin-top: var(--e4); padding-top: var(--e3); border-top: 1px solid var(--rejilla);
  display: grid; gap: 4px; }
```

- [ ] **Step 6: Suite completa y prueba real en el telefono**

```bash
npx vitest run
cd .. && bash tools/refrescar-web.sh
```

Con el backend corriendo, averigua la IP de la máquina (`ipconfig`) y abre `http://<ip>:8080` desde el celular en la misma WiFi. Debe aparecer el botón de instalar bajo el formulario. **Ojo:** los navegadores solo ofrecen instalar en `https://` o en `localhost`; desde el celular por IP y HTTP el botón puede no salir. Si es el caso, pruébalo con Chrome en el escritorio (`localhost:8080`) y anótalo: la instalación real solo se puede verificar contra el despliegue de Render, que sí es HTTPS.

- [ ] **Step 7: Commit**

```bash
git add app/frontend/src/components/BotonInstalar.tsx \
        app/frontend/src/components/BotonInstalar.test.tsx \
        app/frontend/src/pages/Login.tsx app/frontend/src/styles.css
git commit -m "Ofrecer de verdad la instalacion en el telefono

BotonInstalar existia y funcionaba, pero no lo renderizaba nadie: no habia
forma de instalar la aplicacion desde dentro de la aplicacion. En iPhone,
donde no existe beforeinstallprompt, se explica el camino de Safari.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Iconos y portada simétricos en el celular

El manifest declara **el mismo fichero** `icon-512.png` como `any` y como `maskable` (`vite.config.ts:23-25`). Un icono maskable debe tener el escudo dentro del 80 % central porque Android recorta el borde; uno `any` debe llenar el lienzo. Con un solo fichero, uno de los dos casos siempre sale mal: si está pensado para el recorte (hoy, al 68 %), fuera del recorte se ve pequeño y descentrado respecto al marco — que es la asimetría reportada. Además `apple-touch-icon` apunta al de 192, cuando iOS pide 180 y **no** respeta la transparencia: la rellena de negro.

**Files:**
- Modify: `tools/generar-iconos.py`
- Create (generados): `app/frontend/public/icon-maskable-512.png`, `app/frontend/public/apple-touch-icon.png`, `app/frontend/public/portada-1080.png`
- Modify: `app/frontend/vite.config.ts`
- Modify: `app/frontend/index.html`

**Interfaces:**
- Consumes: `docs/marca/logo-colegio.jpeg` y las funciones `escudo()`, `icono(base, lado, ocupacion, transparente)` y `guardar(img, ruta, limite)` que ya existen en `tools/generar-iconos.py`.
- Produces: los tres PNG nuevos con esos nombres exactos; el manifest y el `index.html` los referencian.

- [ ] **Step 1: Comprobar el problema antes de tocar nada**

```bash
cd /c/Users/Julian/Downloads/sistema-control-asistencia
python -c "
from PIL import Image
im = Image.open('app/frontend/public/icon-512.png').convert('RGBA')
caja = im.getbbox()
print('lienzo', im.size, 'contenido', caja)
print('margen izq/der', caja[0], im.width - caja[2])
print('margen sup/inf', caja[1], im.height - caja[3])
"
```

Anota los cuatro márgenes. Si el izquierdo y el derecho no coinciden con el superior y el inferior, el escudo no está centrado en un cuadrado: eso se ve como asimetría en cuanto el sistema lo pone sobre un fondo redondo.

- [ ] **Step 2: Generar los tres ficheros nuevos**

En `tools/generar-iconos.py`, dentro del bloque `if __name__ == "__main__":`, después de la línea que genera `icon-512.png`, añade:

```python
    # Maskable en su propio fichero: Android recorta hasta el 20 % de cada borde, asi
    # que el escudo va al 68 % del lienzo. Compartir fichero con el icono normal
    # obligaba a elegir: o sobrevive al recorte, o llena el marco cuando no lo hay.
    guardar(icono(base, 512, 0.68), DESTINO / "icon-maskable-512.png",
            LIMITES["icon-512.png"])

    # iOS pide 180 px y NO respeta la transparencia: la rellena de negro. Va con el
    # fondo crema del manifest, no transparente.
    guardar(icono(base, 180, 0.86), DESTINO / "apple-touch-icon.png",
            LIMITES["icon-192.png"])

    # Portada del arranque y del login: apaisada, con el escudo centrado de verdad
    # (mismo margen arriba/abajo que a los lados dentro del cuadrado central).
    portada = Image.new("RGB", (1080, 1080), FONDO)
    marca = icono(base, 1080, 0.62, transparente=True)
    portada.paste(marca, (0, 0), marca)
    guardar(portada, DESTINO / "portada-1080.png", 120 * 1024)
```

Y en el diccionario `LIMITES` de la cabecera, añade las dos entradas nuevas:

```python
LIMITES = {"icon-192.png": 30 * 1024, "icon-512.png": 40 * 1024,
           "favicon.ico": 30 * 1024, "escudo.png": 120 * 1024,
           "icon-maskable-512.png": 40 * 1024, "apple-touch-icon.png": 30 * 1024,
           "portada-1080.png": 120 * 1024}
```

Y en el bucle final de comprobación, cambia la tupla por:

```python
    for nombre in ("icon-192.png", "icon-512.png", "favicon.ico", "escudo.png",
                   "icon-maskable-512.png", "apple-touch-icon.png", "portada-1080.png"):
```

- [ ] **Step 3: Ejecutar el generador y verificar el centrado**

```bash
python tools/generar-iconos.py
python -c "
from PIL import Image
for f in ['icon-maskable-512.png','apple-touch-icon.png','portada-1080.png']:
    im = Image.open('app/frontend/public/' + f).convert('RGBA')
    c = im.getbbox()
    izq, der = c[0], im.width - c[2]
    sup, inf = c[1], im.height - c[3]
    print(f, im.size, 'izq/der', izq, der, 'sup/inf', sup, inf)
"
```

Esperado: en cada fichero, `izq` y `der` iguales entre sí (±1 px por el redondeo entero del centrado) y lo mismo `sup` e `inf`. Si no lo son, el escudo recortado no es cuadrado y hay que centrarlo dentro de un cuadrado antes de escalar — en ese caso, en `icono()` cambia el pegado para que use `round()` en vez de división entera.

- [ ] **Step 4: Declararlos en el manifest**

En `app/frontend/vite.config.ts`, sustituye el bloque `icons` por:

```ts
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Fichero propio: el recorte de Android exige el escudo dentro del 80 %
          // central, y ese mismo margen deja el icono normal descentrado del marco.
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
```

Y en la misma configuración de `manifest`, añade después de `orientation`:

```ts
        id: '/',
        categories: ['education', 'productivity'],
```

Añade también `'apple-touch-icon.png'` y `'icon-maskable-512.png'` a `includeAssets`.

- [ ] **Step 5: Arreglar el icono de iOS en el index**

En `app/frontend/index.html`, sustituye:

```html
    <link rel="apple-touch-icon" href="/icon-192.png" />
```

por:

```html
    <!-- iOS pide 180 px y rellena de negro cualquier transparencia: este va con el
         fondo crema del manifest, no transparente. -->
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Asistencia GGM" />
```

- [ ] **Step 6: Construir y comprobar el resultado**

```bash
cd app/frontend && npm run build && cd .. && bash tools/refrescar-web.sh
curl -s http://localhost:8080/manifest.webmanifest | python -m json.tool | head -30
curl -s -o /dev/null -w "apple-touch-icon: %{http_code}\n" http://localhost:8080/apple-touch-icon.png
curl -s -o /dev/null -w "maskable: %{http_code}\n" http://localhost:8080/icon-maskable-512.png
```

Esperado: el manifest lista tres iconos con `purpose` distinto, y los dos ficheros responden `200`.

Después, en Chrome de escritorio: DevTools › Application › Manifest. La sección de iconos no debe mostrar avisos, y la vista previa maskable (casilla "Show only the minimum safe area for maskable icons") debe dejar el escudo entero dentro del círculo.

- [ ] **Step 7: Commit**

```bash
git add tools/generar-iconos.py app/frontend/public/ app/frontend/vite.config.ts \
        app/frontend/index.html
git commit -m "Separar el icono maskable del normal y anadir el de iOS

El manifest declaraba el mismo PNG como any y como maskable: pensado para
sobrevivir al recorte de Android, fuera del recorte se veia pequeño y
descentrado del marco. iOS ademas pide 180 px y rellena de negro la
transparencia.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: El escudo del colegio como marca de agua de fondo

Encargo textual: *«me gustaría que se viera el logo del colegio de fondo medio transparente»*. Hoy el fondo (`styles.css:38-41`) es papel crema con el rayado de planilla, y el escudo solo aparece en el menú y en el login.

**Files:**
- Modify: `app/frontend/src/styles.css`

**Interfaces:**
- Consumes: `/escudo.png` (288×288, fondo transparente, ya lo precachea el service worker).
- Produces: nada de código; solo estilo.

- [ ] **Step 1: Anadir la marca de agua**

Añade al final de `app/frontend/src/styles.css`:

```css
/* Escudo de fondo, muy tenue.
   Va en un ::before fijo y no en background-image del body porque el body ya lleva el
   rayado de planilla, y porque asi la marca de agua NO se desplaza al hacer scroll:
   repetirla en cada pantalla de scroll se lee como un patron, y una sola marca fija
   se lee como el papel membretado que imita.
   pointer-events:none es obligatorio: sin eso, la capa se come los toques del telefono
   sobre los botones que quedan debajo. */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  background: url('/escudo.png') center 45% / min(52vw, 380px) no-repeat;
  opacity: .06;
  pointer-events: none;
}

/* El contenido va por encima de la marca de agua. */
#root { position: relative; z-index: 1; }

/* En pantallas pequeñas el escudo compite con el texto: se reduce y se aclara. */
@media (max-width: 640px) {
  body::before { background-size: 70vw; opacity: .045; }
}

/* Quien haya pedido menos estimulo visual no necesita una imagen decorativa detras. */
@media (prefers-reduced-motion: reduce) {
  body::before { opacity: .03; }
}
```

- [ ] **Step 2: Comprobar que no rompe el contraste ni los toques**

```bash
cd app/frontend && npm run build && cd .. && bash tools/refrescar-web.sh
```

Abre `localhost:8080` con Ctrl+Shift+R y comprueba tres cosas concretas:

1. El escudo se ve detrás del contenido, tenue, y **no se mueve** al hacer scroll.
2. Los botones y enlaces siguen respondiendo (si algo no responde, falta `pointer-events: none`).
3. El texto sobre la marca de agua se sigue leyendo. Si en alguna tarjeta molesta, la tarjeta tiene fondo propio (`--superficie`) y la tapa: el problema solo puede aparecer sobre el fondo desnudo.

- [ ] **Step 3: Comprobarlo tambien en modo movil**

En DevTools, activa la barra de dispositivo (Ctrl+Shift+M), elige un teléfono de 360 px de ancho y recorre `/`, `/asistencia` y `/admin`. La marca de agua debe quedar detrás y no empujar nada: es `position: fixed`, así que no puede cambiar el tamaño de la página. Si aparece barra de scroll horizontal, es de otra cosa — la marca no ocupa espacio de layout.

- [ ] **Step 4: Commit**

```bash
git add app/frontend/src/styles.css
git commit -m "Poner el escudo del colegio como marca de agua de fondo

Fija y al 6 % de opacidad: repetida o con scroll se lee como un patron; una
sola marca fija se lee como el papel membretado que imita.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Versión visible y aviso cuando hay una nueva

`registerType: 'autoUpdate'` (`vite.config.ts:10`) recarga la aplicación sola cuando detecta una versión nueva. En un salón eso es peligroso: puede recargar **mientras el docente está tomando lista**. Y al revés, hoy nadie puede saber qué versión tiene un teléfono, así que «me funciona / a mí no» es imposible de diagnosticar.

**Files:**
- Create: `app/frontend/src/components/Version.tsx`
- Create: `app/frontend/src/components/Version.test.tsx`
- Modify: `app/frontend/vite.config.ts`
- Modify: `app/frontend/package.json`
- Modify: `app/frontend/src/components/Menu.tsx`

**Interfaces:**
- Consumes: `import.meta.env.VITE_VERSION` (lo inyecta Vite desde `package.json`) y el módulo virtual `virtual:pwa-register/react` que ya provee vite-plugin-pwa.
- Produces: el componente `Version` (export default), sin props.

- [ ] **Step 1: Poner version al paquete**

`app/frontend/package.json` no tiene campo `version`. Añádelo como segunda línea, después de `"name"`:

```json
  "version": "1.0.0",
```

- [ ] **Step 2: Exponerla al codigo**

En `app/frontend/vite.config.ts`, arriba del `export default`:

```ts
import { readFileSync } from 'node:fs';

// La version sale de package.json y no de una constante suelta: dos sitios donde
// escribir el mismo numero terminan siempre en dos numeros distintos.
const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };
```

y dentro de `defineConfig({ ... })`, al mismo nivel que `plugins`:

```ts
  define: { 'import.meta.env.VITE_VERSION': JSON.stringify(version) },
```

- [ ] **Step 3: Escribir la prueba que falla**

Crea `app/frontend/src/components/Version.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Version from './Version';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

describe('Version', () => {
  it('muestra la version instalada', () => {
    render(<Version />);
    // Sin esto, "a mi no me funciona" no se puede diagnosticar: nadie sabe que
    // version tiene ese telefono.
    expect(screen.getByText(/v\d+\.\d+\.\d+/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Ejecutar y ver que falla**

```bash
cd app/frontend && npx vitest run src/components/Version.test.tsx
```

Esperado: FALLA con `Failed to resolve import "./Version"`.

- [ ] **Step 5: Implementar**

Crea `app/frontend/src/components/Version.tsx`:

```tsx
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Version instalada y aviso de version nueva.
 *
 * El aviso es un boton y no una recarga automatica a proposito: recargar sola mientras
 * un docente esta tomando lista le vacia la pantalla a mitad del curso. Lo marcado no
 * se pierde (esta en IndexedDB), pero el susto y la lista a medio revisar si.
 */
export default function Version() {
  const { needRefresh: [hayNueva], updateServiceWorker } = useRegisterSW();
  const version = import.meta.env.VITE_VERSION ?? '0.0.0';

  return (
    <div className="version">
      {hayNueva && (
        <button type="button" onClick={() => void updateServiceWorker(true)}>
          Actualizar a la version nueva
        </button>
      )}
      <small className="meta">v{version}</small>
    </div>
  );
}
```

- [ ] **Step 6: Dejar de recargar sola y montar el componente**

En `app/frontend/vite.config.ts`, cambia:

```ts
      registerType: 'autoUpdate',
```

por:

```ts
      // prompt y no autoUpdate: recargar sola puede pasar mientras alguien toma
      // lista. El componente Version ofrece el boton cuando hay algo nuevo.
      registerType: 'prompt',
```

En `app/frontend/src/components/Menu.tsx`, importa y ponlo justo encima del botón de cerrar sesión:

```tsx
import Version from './Version';
```

```tsx
        <Version />
```

- [ ] **Step 7: Ejecutar**

```bash
npx vitest run src/components/Version.test.tsx
```

Esperado: 1 en verde. Si falla al resolver `virtual:pwa-register/react` fuera del mock, comprueba que el `vi.mock` está en el nivel superior del fichero de prueba (se eleva antes de los imports).

- [ ] **Step 8: Suite completa y comprobacion del ciclo de actualizacion**

```bash
npx vitest run
```

Si `Menu.test.tsx` falla al no resolver el módulo virtual, añade el mismo `vi.mock('virtual:pwa-register/react', ...)` del Step 3 al principio de `Menu.test.tsx`.

Después, el ciclo real:

```bash
npm run build && cd .. && bash tools/refrescar-web.sh
```

Abre `localhost:8080`, sube `version` a `1.0.1` en `package.json`, vuelve a construir y refrescar, y recarga la pestaña: debe aparecer el botón *"Actualizar a la version nueva"* en el menú, y al pulsarlo la aplicación se recarga con la versión nueva.

- [ ] **Step 9: Commit**

```bash
git add app/frontend/package.json app/frontend/vite.config.ts \
        app/frontend/src/components/Version.tsx \
        app/frontend/src/components/Version.test.tsx \
        app/frontend/src/components/Menu.tsx
git commit -m "Mostrar la version y avisar de la nueva en vez de recargar sola

autoUpdate podia recargar la aplicacion mientras un docente tomaba lista.
Ahora hay boton, y la version instalada se ve: sin ella, 'a mi no me
funciona' no se puede diagnosticar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Que la próxima mejora no borre lo que el teléfono tiene pendiente

`db/local.ts` declara `this.version(1).stores({...})` y nada más. La próxima vez que alguien añada una tabla o un índice —y este plan ya deja el terreno para varias mejoras más— tiene que subir a `version(2)`. Si lo hace mal, Dexie puede tirar los datos locales: es decir, **la asistencia de una jornada que aún no había subido**. Esta tarea deja la migración escrita y probada antes de que haga falta.

**Files:**
- Modify: `app/frontend/src/db/local.ts`
- Create: `app/frontend/src/db/local.test.ts`

**Interfaces:**
- Consumes: `db` de `./local`.
- Produces: `db.version(2)` con el índice nuevo `outbox: 'key, classDate, error, scheduleBlockId'`, conservando todos los registros existentes.

- [ ] **Step 1: Escribir la prueba que falla**

Crea `app/frontend/src/db/local.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from './local';

describe('base local', () => {
  it('una marca guardada sobrevive a abrir la base otra vez', async () => {
    // Es lo que pasa en cada actualizacion de la aplicacion: si al subir de version
    // la migracion esta mal, esto se lleva por delante la jornada sin subir.
    await db.outbox.clear();
    await db.outbox.put({
      key: '1:7:2026-07-13', id: 'u1', studentId: 1, scheduleBlockId: 7,
      classDate: '2026-07-13', status: 'P', recordedAt: '2026-07-13T12:00:00Z',
    });

    await db.close();
    await db.open();

    expect(await db.outbox.count()).toBe(1);
    expect((await db.outbox.get('1:7:2026-07-13'))?.status).toBe('P');
  });

  it('se puede buscar lo pendiente de un bloque sin recorrer toda la cola', async () => {
    await db.outbox.clear();
    await db.outbox.bulkPut([
      { key: '1:7:2026-07-13', id: 'a', studentId: 1, scheduleBlockId: 7,
        classDate: '2026-07-13', status: 'P', recordedAt: '2026-07-13T12:00:00Z' },
      { key: '2:9:2026-07-13', id: 'b', studentId: 2, scheduleBlockId: 9,
        classDate: '2026-07-13', status: 'F', recordedAt: '2026-07-13T12:00:00Z' },
    ]);

    const delBloque = await db.outbox.where('scheduleBlockId').equals(7).toArray();
    expect(delBloque).toHaveLength(1);
    expect(delBloque[0].id).toBe('a');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app/frontend && npx vitest run src/db/local.test.ts
```

Esperado: la primera pasa; la segunda FALLA con `KeyPath scheduleBlockId on object store outbox is not indexed`.

- [ ] **Step 3: Anadir la version 2**

En `app/frontend/src/db/local.ts`, dentro del `constructor`, **debajo** del bloque `this.version(1)` (nunca lo borres ni lo edites: Dexie lo necesita para migrar teléfonos que sigan en la versión 1):

```ts
    // Version 2: indice por bloque en la cola. Al abrir un bloque, TomarAsistencia
    // recorria la cola entera para encontrar lo suyo; con la jornada de un colegio
    // entero en el telefono eso empieza a notarse.
    //
    // Anadir un indice NO borra datos: Dexie reindexa lo que ya hay. Lo que si borra
    // es quitar una tabla del objeto stores o cambiarle la clave primaria; por eso el
    // bloque de la version 1 se queda tal cual esta, para siempre.
    this.version(2).stores({
      blocks: 'id, grade, weekday',
      students: 'id, grade, documentId',
      schoolDays: 'calendarDate, dayType',
      outbox: 'key, classDate, error, scheduleBlockId',
      entryOutbox: 'id, scannedAt, error',
      meta: 'key',
    });
```

- [ ] **Step 4: Ejecutar**

```bash
npx vitest run src/db/local.test.ts
```

Esperado: 2 en verde.

- [ ] **Step 5: Comprobar la migracion con datos de verdad**

Este es el paso que importa: que un teléfono que ya tenía la versión 1 **no pierda su cola**.

```bash
cd app/frontend && npm run build && cd .. && bash tools/refrescar-web.sh
```

En Chrome: abre `localhost:8080` con la versión anterior todavía cargada (Ctrl+Shift+R primero), entra, marca asistencia de un par de estudiantes **con la red desconectada** (DevTools › Network › Offline) y comprueba en DevTools › Application › IndexedDB › `ggm-asistencia` › `outbox` que hay filas. Ahora recarga con la versión nueva y vuelve a mirar `outbox`: **las mismas filas deben seguir ahí**, y la base debe decir versión 2.

- [ ] **Step 6: Commit**

```bash
git add app/frontend/src/db/local.ts app/frontend/src/db/local.test.ts
git commit -m "Subir la base local a la version 2 con la migracion probada

La proxima mejora que toque el esquema puede llevarse por delante la
asistencia de una jornada que aun no habia subido. Queda escrito que el
bloque de la version 1 no se toca nunca y probado que la cola sobrevive.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Cierre

- [ ] **Verificación final**

```bash
cd /c/Users/Julian/Downloads/sistema-control-asistencia
cd app/frontend && npx vitest run
cd ../backend && mvn -o test
cd ../.. && git status --short && git log --oneline -10
```

Esperado: frontend y backend en verde, árbol limpio.

- [ ] **Prueba de jornada completa, en el celular**

La única que demuestra que el encargo está cumplido. Con el backend corriendo y el frontend desplegado:

1. Instala la aplicación en el teléfono (o en Chrome de escritorio si no hay HTTPS).
2. Entra como `docente01@ggm.edu.co` / `cambiar123` y espera a que descargue los datos.
3. **Pon el teléfono en modo avión.**
4. Toma la lista de un curso entero, con faltas y motivos. Debe funcionar sin un solo error.
5. Cierra la aplicación por completo. Vuelve a abrirla: la lista marcada debe seguir ahí y la franja debe decir cuántas marcas hay guardadas.
6. **Quita el modo avión** y deja el teléfono quieto con la aplicación abierta.
7. En menos de 30 segundos la franja debe desaparecer sola, y la asistencia debe verse en `/asistencia` desde otro dispositivo.

## Fuera de alcance (deliberadamente)

- **Background Sync API** (subir con la aplicación cerrada). Necesita otro service worker propio y no funciona en iOS; el reintento al abrir y al desbloquear cubre el caso real de un docente que usa el teléfono varias veces al día.
- **Editar y borrar asistencia sin conexión.** Hoy requiere conexión a propósito: una edición offline necesita resolución de conflictos (dos personas corrigiendo la misma marca), y eso es un plan aparte.
- **Notificaciones push.** No las pidió nadie y en iOS exigen la aplicación instalada más permisos.
- **Segundo grupo por grado (`0B`, `1B`…)** y el resto de pendientes del plan `2026-08-26-pendientes-post-semilla.md`, que sigue vivo: tareas 7 a 10.
