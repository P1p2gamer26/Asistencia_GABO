# Tests de Interfaz — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cubrir con tests las pantallas y componentes del frontend, que hoy tienen cero.

**Architecture:** Se añade `@testing-library/react` y se prueban los cuatro componentes donde vive la lógica que puede romperse en silencio: el bloqueo por día no lectivo, el estado de conexión, la toma de asistencia y el panel de calendario del administrador. Los tests renderizan el componente real contra un `fetch` y una IndexedDB simulados; no se prueba maquetación ni estilos, se prueba comportamiento.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react, fake-indexeddb.

**Spec:** `docs/INFORME-FINAL.md` (sección de verificación) y `app/README.md`.

## Global Constraints

- **El proyecto vive en `app/`**: `app/backend`, `app/frontend`, `app/contracts`.
- **Frontend:** `cd app/frontend && npm test` y `npm run build`.
- **Sin librerías de UI ni de gráficas.** El paquete **de producción** debe seguir por debajo de 200 KB gzip; `@testing-library/react` entra como `devDependency` y no viaja al paquete.
- **Ningún test toca la red de verdad.** `fetch` se simula con `vi.stubGlobal`; IndexedDB con `fake-indexeddb`, que ya está instalado.
- **Idioma:** identificadores en inglés, texto visible y nombres de test en español. Sin tildes ni letra eñe en nombres de ficheros.
- **`origin` es `P1p2gamer26/Asistencia_GABO` (privado).** `upstream` tiene el push deshabilitado.
- **Commits:** Conventional Commits en español, terminando con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
app/frontend/
├── package.json                                  (modificar) devDependencies
├── vite.config.ts                                (modificar) setupFiles
├── src/test-setup.ts                             (nuevo) limpieza entre tests
└── src/
    ├── components/SelectorFecha.test.tsx         (nuevo)
    ├── components/BannerEstado.test.tsx          (nuevo)
    ├── pages/TomarAsistencia.test.tsx            (nuevo)
    └── components/admin/PanelCalendario.test.tsx (nuevo)
```

---

## Task 1: Preparar el entorno y probar los dos componentes de estado

**Files:**
- Modify: `app/frontend/package.json`
- Modify: `app/frontend/vite.config.ts`
- Create: `app/frontend/src/test-setup.ts`
- Test: `app/frontend/src/components/BannerEstado.test.tsx`
- Test: `app/frontend/src/components/SelectorFecha.test.tsx`

**Interfaces:**
- Consumes: `BannerEstado` (props `online: boolean`, `pendientes: number`, `onSincronizar: () => void`) y `SelectorFecha` (props `valor: string`, `onChange: (fecha: string) => void`, `max: string`), ambos ya existentes.
- Produces: `src/test-setup.ts`, que las tareas siguientes dan por hecho.

`SelectorFecha` es el que importa: es el único punto de la interfaz que impide marcar asistencia en un festivo. Si deja de avisar, el docente cree que registró y no registró nada.

- [ ] **Step 1: Añadir las dependencias de prueba**

```bash
cd app/frontend && npm install -D @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.3 @testing-library/user-event@^14.5.2
```

Van como `devDependencies`: no entran al paquete de producción. Comprobar después del Step 8 que el tamaño del `dist` no cambió.

- [ ] **Step 2: Crear `src/test-setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Sin esto, el DOM de un test se queda montado y el siguiente encuentra dos veces
// el mismo boton. Es la causa numero uno de tests de React que se rompen entre si.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
```

- [ ] **Step 3: Registrarlo en `vite.config.ts`**

Sustituir la línea `test: { environment: 'jsdom' },` por:

```ts
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
```

- [ ] **Step 4: Escribir `src/components/BannerEstado.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BannerEstado from './BannerEstado';

describe('BannerEstado', () => {
  it('no muestra nada cuando hay conexion y no queda nada pendiente', () => {
    const { container } = render(
      <BannerEstado online={true} pendientes={0} onSincronizar={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('avisa cuando no hay conexion', () => {
    render(<BannerEstado online={false} pendientes={0} onSincronizar={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(/sin conexion/i);
  });

  it('sin conexion no ofrece el boton de enviar', () => {
    render(<BannerEstado online={false} pendientes={5} onSincronizar={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('con conexion y pendientes ofrece enviar y avisa cuantos', async () => {
    const enviar = vi.fn();
    render(<BannerEstado online={true} pendientes={3} onSincronizar={enviar} />);
    expect(screen.getByRole('status')).toHaveTextContent('3');
    await userEvent.click(screen.getByRole('button', { name: /enviar ahora/i }));
    expect(enviar).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Escribir `src/components/SelectorFecha.test.tsx`**

```tsx
import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/local';
import SelectorFecha from './SelectorFecha';

describe('SelectorFecha', () => {
  beforeEach(async () => {
    await db.schoolDays.clear();
    await db.schoolDays.bulkPut([
      { calendarDate: '2026-08-13', dayType: 'LECTIVO' },
      { calendarDate: '2026-08-14', dayType: 'LECTIVO' },
      { calendarDate: '2026-08-17', dayType: 'FESTIVO', description: 'Asuncion' },
      { calendarDate: '2026-08-18', dayType: 'LECTIVO' },
      { calendarDate: '2026-08-19', dayType: 'SUSPENDIDO', description: 'Paro' },
    ]);
  });

  it('en un dia lectivo no muestra ninguna advertencia', async () => {
    render(<SelectorFecha valor="2026-08-18" onChange={() => {}} max="2026-08-20" />);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('en un festivo avisa y dice el motivo', async () => {
    render(<SelectorFecha valor="2026-08-17" onChange={() => {}} max="2026-08-20" />);
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/festivo/i);
    expect(aviso).toHaveTextContent(/Asuncion/i);
    expect(aviso).toHaveTextContent(/no se toma asistencia/i);
  });

  it('en un dia suspendido tambien avisa', async () => {
    render(<SelectorFecha valor="2026-08-19" onChange={() => {}} max="2026-08-20" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/suspendido|Paro/i);
  });

  it('una fecha que no esta en el calendario descargado pide actualizar', async () => {
    render(<SelectorFecha valor="2027-03-01" onChange={() => {}} max="2027-12-31" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no esta en el calendario/i);
  });

  it('los atajos solo ofrecen dias lectivos, nunca festivos ni suspendidos', async () => {
    render(<SelectorFecha valor="2026-08-18" onChange={() => {}} max="2026-08-20" />);
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
    const textos = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    // 17 (festivo) y 19 (suspendido) no pueden aparecer entre los atajos
    expect(textos.some((t) => t.includes('17'))).toBe(false);
    expect(textos.some((t) => t.includes('19'))).toBe(false);
    expect(textos.some((t) => t.includes('18'))).toBe(true);
  });
});
```

El último test es el que más vale: comprueba que los atajos **excluyen** los días no lectivos, que es la parte que se vio funcionando en las pruebas de navegador y que nadie protegía.

- [ ] **Step 6: Ejecutar y ver que fallan por falta de entorno**

Run: `cd app/frontend && npm test`
Expected: FAIL. Si `@testing-library/jest-dom/vitest` no resuelve, revisar el Step 1; si `render` no encuentra el DOM, revisar el `environment: 'jsdom'` del Step 3.

- [ ] **Step 7: Ajustar lo que haga falta hasta que pasen**

Los componentes ya existen y no deberían necesitar cambios. Si algún test falla por el texto exacto de un mensaje, **ajustar el test al texto real del componente**, no al revés: el texto ya está revisado y en producción.

La única excepción es el último test del Step 5: si los atajos **sí** incluyen días no lectivos, eso es un bug real del componente y se arregla el componente, filtrando por `dayType === 'LECTIVO'` en la consulta de `db.schoolDays`.

- [ ] **Step 8: Comprobar que el paquete de produccion no crecio**

Run: `cd app/frontend && npm run build`
Expected: el `dist` con el mismo tamaño que antes (unos 97 KB gzip el fragmento principal). Si creció, alguna dependencia de test se coló en `dependencies` en vez de `devDependencies`.

- [ ] **Step 9: Commit**

```bash
git add app/frontend
git commit -m "test: entorno de pruebas de interfaz y tests de BannerEstado y SelectorFecha

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Probar la toma de asistencia y el panel de calendario

**Files:**
- Test: `app/frontend/src/pages/TomarAsistencia.test.tsx`
- Test: `app/frontend/src/components/admin/PanelCalendario.test.tsx`

**Interfaces:**
- Consumes: `src/test-setup.ts` (Task 1), `db` de `src/db/local.ts`, `markAttendance` de `src/sync/engine.ts`.
- Produces: nada que consuman otras tareas.

`TomarAsistencia` es la pantalla que usan cuarenta docentes todos los días y la que más lógica tiene: filtra cursos, filtra bloques, recupera marcas locales y bloquea días no lectivos. Hoy no la protege ni un test.

- [ ] **Step 1: Escribir `src/pages/TomarAsistencia.test.tsx`**

```tsx
import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/local';
import TomarAsistencia from './TomarAsistencia';

const HOY = new Date().toLocaleDateString('en-CA');

describe('TomarAsistencia', () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.blocks.clear();
    await db.students.clear();
    await db.schoolDays.clear();

    await db.schoolDays.bulkPut([{ calendarDate: HOY, dayType: 'LECTIVO' }]);
    await db.blocks.bulkPut([
      { id: 1, grade: '601', weekday: 1, blockNo: 1, subject: 'Matematicas', startTime: '06:30' },
      { id: 2, grade: '602', weekday: 1, blockNo: 2, subject: 'Espanol', startTime: '07:20' },
    ]);
    await db.students.bulkPut([
      { id: 10, documentId: '111', fullName: 'ANA LOPEZ', grade: '601' },
      { id: 11, documentId: '222', fullName: 'BETO RUIZ', grade: '601' },
      { id: 12, documentId: '333', fullName: 'CARLA DIAZ', grade: '602' },
    ]);
  });

  it('sin curso elegido no muestra estudiantes', async () => {
    render(<TomarAsistencia />);
    expect(await screen.findByText(/elija curso y bloque/i)).toBeInTheDocument();
  });

  it('al elegir curso y bloque muestra solo los estudiantes de ese curso', async () => {
    render(<TomarAsistencia />);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await waitFor(() => expect(screen.getByLabelText(/bloque/i)).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText(/bloque/i), '1');

    expect(await screen.findByText('ANA LOPEZ')).toBeInTheDocument();
    expect(screen.getByText('BETO RUIZ')).toBeInTheDocument();
    expect(screen.queryByText('CARLA DIAZ')).not.toBeInTheDocument();
  });

  it('marcar una falta la deja en la cola local, sin tocar la red', async () => {
    render(<TomarAsistencia />);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await waitFor(() => expect(screen.getByLabelText(/bloque/i)).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText(/bloque/i), '1');

    const grupo = await screen.findByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: 'F' }));

    await waitFor(async () => {
      const cola = await db.outbox.toArray();
      expect(cola).toHaveLength(1);
      expect(cola[0].studentId).toBe(10);
      expect(cola[0].status).toBe('F');
    });
  });

  it('el curso ofrecido es solo el del horario del docente', async () => {
    render(<TomarAsistencia />);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    const opciones = Array.from(screen.getByLabelText(/curso/i).querySelectorAll('option'))
      .map((o) => o.value)
      .filter(Boolean);
    expect(opciones.sort()).toEqual(['601', '602']);
  });
});
```

Añadir `within` al import de `@testing-library/react`:
`import { render, screen, waitFor, within } from '@testing-library/react';`

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/frontend && npm test`
Expected: FAIL. Si falla porque `getByRole('group')` no encuentra nada, comprobar que la lista de estudiantes de `TomarAsistencia.tsx` tiene el `role="group"` con `aria-label={\`Estado de ${s.fullName}\`}`; si no lo tiene, **añadirlo al componente**: sin él la pantalla tampoco es navegable con lector de pantalla, así que el test está señalando un defecto real de accesibilidad.

- [ ] **Step 3: Ajustar hasta que pasen**

Igual que en la Task 1: si falla por un texto, se ajusta el test; si falla por falta de un rol o etiqueta accesible, se arregla el componente.

- [ ] **Step 4: Escribir `src/components/admin/PanelCalendario.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PanelCalendario from './PanelCalendario';

const DIAS = [
  { calendarDate: '2026-09-14', dayType: 'LECTIVO' },
  { calendarDate: '2026-09-15', dayType: 'LECTIVO' },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('PanelCalendario', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify(
      { token: 't', refreshToken: 'r', role: 'ADMIN', fullName: 'Admin', userId: 1 }));
  });

  it('lista los dias del rango con su tipo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DIAS)));
    render(<PanelCalendario />);
    expect(await screen.findByLabelText('Tipo de dia para 2026-09-14')).toHaveValue('LECTIVO');
    expect(screen.getByLabelText('Tipo de dia para 2026-09-15')).toHaveValue('LECTIVO');
  });

  it('cambiar un dia a SUSPENDIDO manda el PUT correcto', async () => {
    const llamadas: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        llamadas.push({ url, body: JSON.parse(String(init.body)) });
        return respuesta({});
      }
      return respuesta(DIAS);
    }));

    render(<PanelCalendario />);
    const selector = await screen.findByLabelText('Tipo de dia para 2026-09-14');
    await userEvent.selectOptions(selector, 'SUSPENDIDO');

    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].url).toContain('/api/calendar/school-days/2026-09-14');
    expect(llamadas[0].body).toMatchObject({ dayType: 'SUSPENDIDO' });
  });

  it('si el servidor falla lo dice en vez de fingir que guardo', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response('', { status: 500 });
      return respuesta(DIAS);
    }));

    render(<PanelCalendario />);
    const selector = await screen.findByLabelText('Tipo de dia para 2026-09-14');
    await userEvent.selectOptions(selector, 'SUSPENDIDO');

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo actualizar/i);
  });
});
```

El tercer test es el importante: si el `PUT` falla y la pantalla no lo dice, el rector cree que cerró el día y no lo cerró.

- [ ] **Step 5: Ejecutar toda la suite**

Run: `cd app/frontend && npm test`
Expected: PASS todo. Deberían ser unos 35 tests entre los 19 de antes y los nuevos.

- [ ] **Step 6: Comprobar el tamaño del paquete**

Run: `cd app/frontend && npm run build`
Expected: el fragmento principal sigue alrededor de 97 KB gzip y por debajo de 200 KB.

- [ ] **Step 7: Commit**

```bash
git add app/frontend
git commit -m "test: cobertura de la toma de asistencia y del panel de calendario

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fuera de alcance

1. **Tests de las demás pantallas** (`Login`, `Home`, `Ingreso`, `Consultas`, `Dashboard`, `Padre`, paneles de usuarios y carga). Se cubren primero las cuatro piezas con más lógica y más riesgo; el resto puede seguir el mismo patrón cuando haga falta.
2. **Tests de extremo a extremo automatizados** con navegador real. Hoy se hacen a mano con `agent-browser`, que ya detectó dos bugs que los tests unitarios no vieron. Automatizarlos exige levantar backend y base en la integración continua: merece su propio plan.
3. **Cobertura medida** (`vitest --coverage`). Un porcentaje sin criterio invita a escribir tests para subir el número.

## Self-review

**Cobertura.** El hueco señalado —17 componentes sin ningún test— se ataca en los cuatro con más lógica: bloqueo por calendario (`SelectorFecha`), estado de conexión (`BannerEstado`), la pantalla principal (`TomarAsistencia`) y el panel del rector (`PanelCalendario`). El resto queda explícitamente fuera de alcance con su motivo.

**Sin marcadores de posición.** Cada paso trae el código o el comando exacto.

**Consistencia.** Las props usadas coinciden con los componentes reales: `BannerEstado(online, pendientes, onSincronizar)` y `SelectorFecha(valor, onChange, max)`. Los tipos de `db.schoolDays` (`calendarDate`, `dayType`, `description`) y de `db.blocks`/`db.students` son los de `src/api/contract.ts`. La clave de sesión es `ggm.session`, la misma que usa `client.ts`.

**Riesgo asumido.** Dos tests pueden fallar por razones legítimas distintas: el de atajos de `SelectorFecha` si el componente no filtra por `LECTIVO`, y el de `role="group"` en `TomarAsistencia` si falta la etiqueta accesible. En ambos casos el plan dice explícitamente arreglar **el componente**, no el test: son defectos reales, uno de corrección y otro de accesibilidad.
