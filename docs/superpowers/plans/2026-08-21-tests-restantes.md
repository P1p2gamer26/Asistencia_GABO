# Tests de los Componentes Restantes — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cubrir con tests los componentes que quedaron fuera de la primera tanda, empezando por el portal del acudiente, que es el más delicado.

**Architecture:** Se sigue el patrón ya establecido en `src/components/SelectorFecha.test.tsx`: renderizar el componente real con `@testing-library/react`, simular `fetch` con `vi.stubGlobal` y esperar los efectos asíncronos con `waitFor`, nunca con `findBy*`.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react.

**Spec:** `docs/INFORME-FINAL.md` y la sección "Fuera de alcance" de `docs/superpowers/plans/2026-08-21-tests-de-interfaz.md`.

## Global Constraints

- **El proyecto vive en `app/`.** Frontend: `cd app/frontend && npm test` y `npm run build`.
- **`waitFor`, nunca `findByRole`, para comprobar contenido que depende de un efecto asíncrono.** `findByRole` devuelve el primer render y el test se vuelve inestable según lo rápido que responda la fuente de datos. Ya pasó una vez.
- **Ningún test toca la red.** `fetch` se simula con `vi.stubGlobal`; la sesión se pone en `localStorage` bajo la clave `ggm.session`.
- **El entorno de pruebas ya está montado** (`src/test-setup.ts` hace `cleanup`, `unstubAllGlobals` y `restoreAllMocks` después de cada test). No hay que tocarlo.
- **No añadir dependencias.** Todo lo necesario ya está instalado.
- **El paquete de producción debe seguir por debajo de 200 KB gzip** (hoy 97,45 KB).
- **Idioma:** identificadores en inglés, texto visible y nombres de test en español. Sin tildes ni letra eñe en nombres de ficheros.
- **Commits:** Conventional Commits en español, terminando con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
app/frontend/src/
├── pages/Padre.test.tsx                        (nuevo)
├── components/admin/PanelUsuarios.test.tsx     (nuevo)
└── components/admin/PanelCarga.test.tsx        (nuevo)
```

---

## Task 1: El portal del acudiente

**Files:**
- Test: `app/frontend/src/pages/Padre.test.tsx`

**Interfaces:**
- Consumes: `Padre` de `src/pages/Padre.tsx`, que llama a `GET /api/guardian/children` y espera `[{studentId, fullName, grade, recent: [{classDate, subject, status, comment}]}]`.
- Produces: nada que consuman otras tareas.

Es la pantalla más delicada del sistema: la ven los padres y muestra datos de menores. Lo que hay que blindar es que **solo pinta lo que el servidor le devuelve** y que las novedades se leen en español, no como letras sueltas.

- [ ] **Step 1: Escribir el test**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Padre from './Padre';

const HIJOS = [
  {
    studentId: 2,
    fullName: 'JUAN DIEGO AVILA VERGARA',
    grade: '601',
    recent: [
      { classDate: '2026-08-20', subject: 'Matematicas', status: 'F' },
      { classDate: '2026-08-19', subject: 'Espanol', status: 'T', comment: 'Bus demorado' },
      { classDate: '2026-08-18', subject: 'Matematicas', status: 'P' },
    ],
  },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Padre', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ACUDIENTE',
      fullName: 'Maria Figueroa', userId: 9,
    }));
  });

  it('muestra el nombre del hijo y su curso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HIJOS)));
    render(<Padre />);
    await waitFor(() => {
      expect(screen.getByText(/JUAN DIEGO AVILA VERGARA/)).toBeInTheDocument();
      expect(screen.getByText(/601/)).toBeInTheDocument();
    });
  });

  it('traduce los estados a texto legible, no muestra letras sueltas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HIJOS)));
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/No asistio/i)).toBeInTheDocument());
    expect(screen.getByText(/Llego tarde/i)).toBeInTheDocument();
  });

  it('no lista los dias en que el estudiante asistio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HIJOS)));
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/No asistio/i)).toBeInTheDocument());
    // Solo interesan las novedades: un listado con los 190 dias presentes seria inutil.
    expect(screen.queryByText(/^Presente$/i)).not.toBeInTheDocument();
  });

  it('muestra el comentario del docente cuando lo hay', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HIJOS)));
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/Bus demorado/)).toBeInTheDocument());
  });

  it('cuenta las novedades, no los registros totales', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HIJOS)));
    render(<Padre />);
    // De los tres registros, dos son novedad (F y T) y uno es asistencia normal.
    await waitFor(() => expect(screen.getByText(/2 novedad/i)).toBeInTheDocument());
  });

  it('sin conexion lo dice en vez de fingir que no hay novedades', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    render(<Padre />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo consultar/i));
  });

  it('un acudiente sin hijos registrados no rompe la pantalla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([])));
    render(<Padre />);
    await waitFor(() =>
      expect(screen.getByText(/Maria Figueroa/)).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y ver qué falla**

Run: `cd app/frontend && npm test src/pages/Padre.test.tsx`
Expected: alguno puede fallar por el texto exacto. **Ajustar el test al texto real del componente**, que ya está revisado y en uso, salvo en un caso: si el contador de novedades cuenta los registros totales en vez de las novedades, eso es un bug real y se corrige el componente.

- [ ] **Step 3: Dejar los siete en verde**

Run: `cd app/frontend && npm test src/pages/Padre.test.tsx`
Expected: PASS los siete.

- [ ] **Step 4: Commit**

```bash
git add app/frontend/src/pages/Padre.test.tsx
git commit -m "test: cobertura del portal del acudiente

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Los dos paneles de administración restantes

**Files:**
- Test: `app/frontend/src/components/admin/PanelUsuarios.test.tsx`
- Test: `app/frontend/src/components/admin/PanelCarga.test.tsx`

**Interfaces:**
- Consumes: `PanelUsuarios` (usa `GET/POST/PUT /api/admin/users` y `POST /api/admin/users/{id}/reset-password`) y `PanelCarga` (usa `POST /api/admin/import/{students,schedule,guardians}` con `FormData`).
- Produces: nada que consuman otras tareas.

Lo que hay que blindar en `PanelUsuarios` es que **la contraseña temporal se le muestre al administrador**: si el aviso no aparece, crea un usuario que nadie sabe cómo usar. En `PanelCarga`, que los errores por línea se muestren: un importador que dice "0 filas cargadas" sin decir por qué es inservible con 1.200 estudiantes.

- [ ] **Step 1: Escribir `PanelUsuarios.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PanelUsuarios from './PanelUsuarios';

const USUARIOS = [
  { id: 1, email: 'admin@ggm.edu.co', fullName: 'Administrador GGM', role: 'ADMIN', active: true },
  { id: 3, email: 'fpalacios@ggm.edu.co', fullName: 'Francisco Palacios', role: 'DOCENTE', active: true },
];

function respuesta(datos: unknown, status = 200) {
  return new Response(JSON.stringify(datos),
    { status, headers: { 'Content-Type': 'application/json' } });
}

describe('PanelUsuarios', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ADMIN', fullName: 'Admin', userId: 1,
    }));
  });

  it('lista los usuarios con su rol y estado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(USUARIOS)));
    render(<PanelUsuarios />);
    await waitFor(() => expect(screen.getByText('Francisco Palacios')).toBeInTheDocument());
    expect(screen.getByText('fpalacios@ggm.edu.co')).toBeInTheDocument();
  });

  it('al crear un usuario le dice al administrador la contrasena temporal', async () => {
    const creado = { id: 9, email: 'nueva@ggm.edu.co', fullName: 'Nueva Docente',
                     role: 'DOCENTE', active: true };
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) =>
      respuesta(init?.method === 'POST' ? creado : USUARIOS)));

    render(<PanelUsuarios />);
    await userEvent.type(screen.getByLabelText(/correo/i), 'nueva@ggm.edu.co');
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Nueva Docente');
    await userEvent.click(screen.getByRole('button', { name: /crear usuario/i }));

    // Sin este aviso, el administrador crea a alguien que no sabe como entrar.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/cambiar123/));
  });

  it('si el correo ya existe lo dice en vez de fallar en silencio', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) =>
      init?.method === 'POST' ? respuesta({}, 409) : respuesta(USUARIOS)));

    render(<PanelUsuarios />);
    await userEvent.type(screen.getByLabelText(/correo/i), 'admin@ggm.edu.co');
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Repetido');
    await userEvent.click(screen.getByRole('button', { name: /crear usuario/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('desactivar manda un PUT con active en false', async () => {
    const puts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { puts.push(JSON.parse(String(init.body))); return respuesta({}); }
      return respuesta(USUARIOS);
    }));

    render(<PanelUsuarios />);
    await waitFor(() => expect(screen.getByText('Francisco Palacios')).toBeInTheDocument());
    const filas = screen.getAllByRole('button', { name: /desactivar/i });
    await userEvent.click(filas[0]);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ active: false });
  });
});
```

- [ ] **Step 2: Escribir `PanelCarga.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PanelCarga from './PanelCarga';

function csv(nombre = 'estudiantes.csv') {
  return new File(['document_id,first_name\n123,ANA\n'], nombre, { type: 'text/csv' });
}

describe('PanelCarga', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ADMIN', fullName: 'Admin', userId: 1,
    }));
  });

  it('muestra las tres cargas con su cabecera esperada', () => {
    render(<PanelCarga />);
    expect(screen.getByText(/Estudiantes/)).toBeInTheDocument();
    expect(screen.getByText(/Horario/)).toBeInTheDocument();
    expect(screen.getByText(/Acudientes/)).toBeInTheDocument();
    expect(screen.getByText(/document_id,first_name/)).toBeInTheDocument();
  });

  it('informa cuantas filas se cargaron', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ imported: 1200, errors: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));

    render(<PanelCarga />);
    await userEvent.upload(screen.getByLabelText(/archivo csv de estudiantes/i), csv());
    await waitFor(() => expect(screen.getByText(/1200 fila/i)).toBeInTheDocument());
  });

  it('muestra el detalle de las lineas con error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ imported: 2, errors: ['Linea 5: faltan columnas', 'Linea 9: documento vacio'] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));

    render(<PanelCarga />);
    await userEvent.upload(screen.getByLabelText(/archivo csv de estudiantes/i), csv());
    // "0 filas cargadas" sin decir por que es inservible con 1200 estudiantes.
    await waitFor(() => expect(screen.getByText(/Linea 5: faltan columnas/)).toBeInTheDocument());
    expect(screen.getByText(/Linea 9: documento vacio/)).toBeInTheDocument();
  });

  it('si el servidor rechaza el archivo lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    render(<PanelCarga />);
    await userEvent.upload(screen.getByLabelText(/archivo csv de estudiantes/i), csv());
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i));
  });
});
```

- [ ] **Step 3: Ejecutar y dejar en verde**

Run: `cd app/frontend && npm test`
Expected: PASS todo, unos 46 tests. Si algo falla por el texto exacto, ajustar el test al texto real del componente; si falla porque un mensaje de error no aparece, arreglar el componente: un fallo silencioso en una pantalla de administración es un defecto real.

- [ ] **Step 4: Comprobar el tamaño del paquete**

Run: `cd app/frontend && npm run build`
Expected: el fragmento principal sigue en torno a 97 KB gzip.

- [ ] **Step 5: Commit**

```bash
git add app/frontend/src/components/admin
git commit -m "test: cobertura de los paneles de usuarios y de carga de datos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fuera de alcance

1. **`Login`, `Home`, `Ingreso`, `Consultas`, `Dashboard`.** `Login` y `Home` son casi
   presentacionales; `Ingreso` depende de la cámara, que no se puede simular de forma
   útil en jsdom; `Consultas` y `Dashboard` ya están cubiertos indirectamente por los
   tests de geometría de las gráficas y por las pruebas de extremo a extremo en
   navegador real.
2. **Pruebas de extremo a extremo automatizadas.** Hoy se hacen a mano con
   `agent-browser` y han encontrado dos bugs que los tests unitarios no vieron.
   Automatizarlas exige levantar backend y base en la integración continua.

## Self-review

**Cobertura.** De los ocho componentes sin tests, se cubren los tres con lógica real y
riesgo: el portal del acudiente (datos de menores), el panel de usuarios (contraseñas)
y el de carga (1.200 registros). Los cinco restantes quedan fuera de alcance con su
motivo.

**Sin marcadores de posición.** Cada paso trae el código completo.

**Consistencia.** La clave de sesión es `ggm.session`, la misma de `client.ts`. Las
formas de respuesta coinciden con lo que devuelven los controladores: `AdminUser`
(`id`, `email`, `fullName`, `role`, `active`) e `ImportResult` (`imported`, `errors`).
Las etiquetas accesibles usadas (`archivo csv de estudiantes`, `correo`, `nombre`) son
las que ya declaran los componentes.

**Riesgo asumido.** Dos tests pueden fallar señalando defectos reales en vez de suyos:
el contador de novedades de `Padre`, si cuenta registros en vez de novedades, y los
mensajes de error de los paneles, si algún fallo se traga en silencio. El plan dice
explícitamente arreglar el componente en esos dos casos.
