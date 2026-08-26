import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PanelEstudiantes from './PanelEstudiantes';

const LISTA = [
  { id: 1, documentId: '111', fullName: 'ANA LOPEZ', firstName: 'ANA', lastName: 'LOPEZ',
    grade: '6A', active: true },
  { id: 2, documentId: '222', fullName: 'BETO RUIZ', firstName: 'BETO', lastName: 'RUIZ',
    grade: '6A', active: false },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function sesionAdmin() {
  localStorage.setItem('ggm.session', JSON.stringify({
    token: 't', refreshToken: 'r', role: 'ADMIN', fullName: 'Admin', userId: 1,
    mustChangePassword: false,
  }));
}

describe('PanelEstudiantes', () => {
  beforeEach(() => {
    localStorage.clear();
    sesionAdmin();
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(LISTA)));
  });

  it('lista los estudiantes y marca los inactivos', async () => {
    render(<PanelEstudiantes />);
    expect(await screen.findByText('ANA LOPEZ')).toBeInTheDocument();
    expect(screen.getByText(/ID 222 · curso 6A · inactivo/)).toBeInTheDocument();
  });

  it('crear envia un POST con el documento y el curso', async () => {
    const llamadas: { url: string; metodo?: string; cuerpo?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, metodo: init?.method, cuerpo: init?.body as string });
      return respuesta(init?.method === 'POST' ? LISTA[0] : LISTA);
    }));

    render(<PanelEstudiantes />);
    await userEvent.type(screen.getByLabelText(/^documento$/i), '333');
    await userEvent.type(screen.getByLabelText(/^nombres$/i), 'CARLA');
    await userEvent.type(screen.getByLabelText(/^apellido$/i), 'DIAZ');
    await userEvent.type(screen.getByLabelText(/^curso$/i), '7A');
    await userEvent.click(screen.getByRole('button', { name: /crear estudiante/i }));

    await waitFor(() => expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true));
    const post = llamadas.find((l) => l.metodo === 'POST')!;
    expect(post.url).toContain('/api/admin/students');
    expect(post.cuerpo).toContain('"documentId":"333"');
    expect(post.cuerpo).toContain('"grade":"7A"');
  });

  it('dar de baja pide confirmacion y no borra si se cancela', async () => {
    const metodos: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method) metodos.push(init.method);
      return respuesta(LISTA);
    }));
    vi.stubGlobal('confirm', vi.fn(() => false));

    render(<PanelEstudiantes />);
    await screen.findByText('ANA LOPEZ');
    const fila = screen.getByText('ANA LOPEZ').closest('li') as HTMLElement;
    await userEvent.click(within(fila).getByRole('button', { name: /dar de baja/i }));

    expect(metodos).not.toContain('DELETE');
  });

  it('al dar de baja dice si se conservo el historial o si se borro de verdad', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) =>
      respuesta(init?.method === 'DELETE' ? { borradoDefinitivo: false } : LISTA)));
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(<PanelEstudiantes />);
    await screen.findByText('ANA LOPEZ');
    const fila = screen.getByText('ANA LOPEZ').closest('li') as HTMLElement;
    await userEvent.click(within(fila).getByRole('button', { name: /dar de baja/i }));

    expect(await screen.findByRole('status'))
      .toHaveTextContent(/quedo inactivo. Su historial de asistencia se conserva/i);
  });

  it('si la lista no carga lo dice en vez de quedarse vacia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    render(<PanelEstudiantes />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo cargar/i);
  });
});
