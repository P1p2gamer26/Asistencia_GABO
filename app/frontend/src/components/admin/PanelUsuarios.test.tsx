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
