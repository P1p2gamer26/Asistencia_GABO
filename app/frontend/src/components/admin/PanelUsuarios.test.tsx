import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('al crear un docente muestra los siguientes pasos y permite saltarlos', async () => {
    const creado = { id: 9, email: 'nueva@ggm.edu.co', fullName: 'Nueva Docente',
                     role: 'DOCENTE', active: true };
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) =>
      respuesta(init?.method === 'POST' ? creado : USUARIOS)));

    render(<PanelUsuarios />);
    await userEvent.type(screen.getByLabelText(/correo/i), 'nueva@ggm.edu.co');
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Nueva Docente');
    await userEvent.click(screen.getByRole('button', { name: /crear usuario/i }));

    const siguientesPasos = await screen.findByRole('region', { name: /siguientes pasos/i });
    expect(siguientesPasos).toHaveTextContent('Docente creado: Nueva Docente (nueva@ggm.edu.co)');
    expect(siguientesPasos).toHaveTextContent(/Asignarle sus bloques en la pestana Horario/);
    expect(siguientesPasos).toHaveTextContent(/Comprobar que el calendario escolar/);
    expect(siguientesPasos).toHaveTextContent(/Entregarle el correo y la clave temporal/);

    await userEvent.click(screen.getByRole('button', { name: /saltar por ahora/i }));
    expect(screen.queryByRole('region', { name: /siguientes pasos/i })).not.toBeInTheDocument();
  });

  it('al asignar horario envia el docente creado', async () => {
    const creado = { id: 9, email: 'nueva@ggm.edu.co', fullName: 'Nueva Docente',
                     role: 'DOCENTE', active: true };
    const onAsignarHorario = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) =>
      respuesta(init?.method === 'POST' ? creado : USUARIOS)));

    render(<PanelUsuarios onAsignarHorario={onAsignarHorario} />);
    await userEvent.type(screen.getByLabelText(/correo/i), 'nueva@ggm.edu.co');
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Nueva Docente');
    await userEvent.click(screen.getByRole('button', { name: /crear usuario/i }));
    await userEvent.click(await screen.findByRole('button', { name: /asignar horario ahora/i }));

    expect(onAsignarHorario).toHaveBeenCalledWith(creado);
  });

  it('al crear un acudiente conserva el banner habitual', async () => {
    const creado = { id: 9, email: 'nuevo@ggm.edu.co', fullName: 'Nuevo Acudiente',
                     role: 'ACUDIENTE', active: true };
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) =>
      respuesta(init?.method === 'POST' ? creado : USUARIOS)));

    render(<PanelUsuarios />);
    await userEvent.type(screen.getByLabelText(/correo/i), 'nuevo@ggm.edu.co');
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Nuevo Acudiente');
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'ACUDIENTE');
    await userEvent.click(screen.getByRole('button', { name: /crear usuario/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/cambiar123/));
    expect(screen.queryByRole('region', { name: /siguientes pasos/i })).not.toBeInTheDocument();
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

  it('editar cambia nombre y rol y manda un PUT', async () => {
    const puts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { puts.push(JSON.parse(String(init.body))); return respuesta({}); }
      return respuesta(USUARIOS);
    }));

    render(<PanelUsuarios />);
    await waitFor(() => expect(screen.getByText('Francisco Palacios')).toBeInTheDocument());

    const fila = screen.getByRole('row', { name: /fpalacios@ggm\.edu\.co/i });
    await userEvent.click(within(fila).getByRole('button', { name: /editar/i }));

    const nombre = within(fila).getByLabelText(/editar nombre/i);
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Francisco Palacios Suárez');
    await userEvent.selectOptions(within(fila).getByLabelText(/editar rol/i), 'ADMIN');
    await userEvent.click(within(fila).getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({
      fullName: 'Francisco Palacios Suárez', role: 'ADMIN', active: true,
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/guardado/i));
  });

  it('borrar pide confirmacion y no llama al servidor si se cancela', async () => {
    const fetchMock = vi.fn(async () => respuesta(USUARIOS));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PanelUsuarios />);
    await screen.findByText('Francisco Palacios');
    await userEvent.click(screen.getByRole('button', { name: /borrar cuenta de francisco palacios/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
  });

  it('confirmado, borra la cuenta con DELETE y recarga la lista', async () => {
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) =>
      init?.method === 'DELETE' ? new Response(null, { status: 204 }) : respuesta(USUARIOS));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PanelUsuarios />);
    await screen.findByText('Francisco Palacios');
    await userEvent.click(screen.getByRole('button', { name: /borrar cuenta de francisco palacios/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/borrada/i));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/admin/users/3'),
      expect.objectContaining({ method: 'DELETE' }));
  });

  it('si el servidor rechaza el borrado muestra el motivo', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? respuesta({ detail: 'Tiene 4 bloques en el horario. Reasignalos antes.' }, 409)
        : respuesta(USUARIOS)));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PanelUsuarios />);
    await screen.findByText('Francisco Palacios');
    await userEvent.click(screen.getByRole('button', { name: /borrar cuenta de francisco palacios/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Tiene 4 bloques/);
  });

  describe('cursos asignados', () => {
    const todos = [...USUARIOS, { id: 5, email: 'a@x.co', fullName: 'Ana Acudiente', role: 'ACUDIENTE', active: true }];
    function mock(puts: unknown[] = []) {
      const f = vi.fn(async (u: string, init?: RequestInit) => {
        if (u.includes('/assignments')) {
          if (init?.method === 'PUT') { puts.push(JSON.parse(String(init.body))); return respuesta({}); }
          return respuesta({ grades: ['6A'] });
        }
        if (u.includes('/api/reports/summary')) return respuesta([{ grade: '6A' }, { grade: '7B' }]);
        return respuesta(todos);
      });
      vi.stubGlobal('fetch', f);
      return f;
    }

    it('el selector de rol ofrece ORIENTADOR', async () => {
      mock();
      render(<PanelUsuarios />);
      expect(within(screen.getByLabelText('Rol')).getByRole('option', { name: 'ORIENTADOR' })).toBeInTheDocument();
    });

    it('al abrir un docente carga sus cursos y los marca', async () => {
      const f = mock();
      render(<PanelUsuarios />);
      await userEvent.click(await screen.findByRole('button', { name: 'Cursos de Francisco Palacios' }));
      expect(await screen.findByLabelText('6A')).toBeChecked();
      expect(await screen.findByLabelText('7B')).not.toBeChecked();
      expect(f).toHaveBeenCalledWith(expect.stringContaining('/api/admin/users/3/assignments'), expect.anything());
    });

    it('al guardar envia el PUT con los cursos marcados', async () => {
      const puts: unknown[] = [];
      mock(puts);
      render(<PanelUsuarios />);
      await userEvent.click(await screen.findByRole('button', { name: 'Cursos de Francisco Palacios' }));
      await userEvent.click(await screen.findByLabelText('7B'));
      await userEvent.click(screen.getByRole('button', { name: /guardar cursos/i }));
      await waitFor(() => expect(puts).toEqual([{ grades: ['6A', '7B'] }]));
    });

    it('un acudiente no muestra la opcion de cursos', async () => {
      mock();
      render(<PanelUsuarios />);
      await screen.findByText('Ana Acudiente');
      expect(screen.queryByRole('button', { name: 'Cursos de Ana Acudiente' })).not.toBeInTheDocument();
    });
  });
});
