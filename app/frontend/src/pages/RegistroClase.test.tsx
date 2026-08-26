import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RegistroClase from './RegistroClase';

const DETALLE = [
  { id: 'a1', studentId: 10, fullName: 'ANA LOPEZ', documentId: '111',
    status: 'P', recordedByName: 'Marta Restrepo', recordedAt: '2026-08-21T12:10:00Z' },
  { id: 'b2', studentId: 11, fullName: 'BETO RUIZ', documentId: '222',
    status: 'F', comment: 'Cita medica', recordedByName: 'Marta Restrepo',
    recordedAt: '2026-08-21T12:10:00Z' },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function pintar() {
  localStorage.setItem('ggm.session', JSON.stringify({
    token: 't', refreshToken: 'r', role: 'COORDINADOR', fullName: 'Coord Persona',
    userId: 9, mustChangePassword: false,
  }));
  return render(
    <MemoryRouter initialEntries={['/asistencia/7/2026-08-21?curso=6A&bloque=3&materia=Espanol']}>
      <Routes>
        <Route path="/asistencia/:blockId/:fecha" element={<RegistroClase />} />
      </Routes>
    </MemoryRouter>);
}

describe('RegistroClase', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DETALLE)));
  });

  it('muestra el curso, el bloque y la materia que vienen en la URL', async () => {
    pintar();
    const titulo = await screen.findByRole('heading', { level: 1 });
    expect(titulo).toHaveTextContent(/6A/);
    expect(titulo).toHaveTextContent(/Bloque 3/);
    expect(titulo).toHaveTextContent(/Espanol/);
  });

  it('lista todos los estudiantes con su estado y quien tomo la lista', async () => {
    pintar();
    expect(await screen.findByText('ANA LOPEZ')).toBeInTheDocument();
    expect(screen.getByText('BETO RUIZ')).toBeInTheDocument();
    expect(screen.getByText('Cita medica')).toBeInTheDocument();
    expect(screen.getAllByText(/Marta Restrepo/).length).toBe(2);
  });

  it('resume cuantos hay de cada estado', async () => {
    pintar();
    expect(await screen.findByText(/2 estudiantes/)).toBeInTheDocument();
    expect(screen.getByText(/1 presente/)).toBeInTheDocument();
    expect(screen.getByText(/1 falta/)).toBeInTheDocument();
  });

  it('al editar envia un PUT con el nuevo estado', async () => {
    const llamadas: { url: string; metodo?: string; cuerpo?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, metodo: init?.method, cuerpo: init?.body as string });
      return respuesta(DETALLE);
    }));

    pintar();
    await screen.findByText('ANA LOPEZ');
    const fila = screen.getByText('ANA LOPEZ').closest('li') as HTMLElement;
    await userEvent.click(within(fila).getByRole('button', { name: /editar/i }));
    await userEvent.selectOptions(screen.getByLabelText(/nuevo estado de ANA LOPEZ/i), 'T');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(llamadas.some(
      (l) => l.metodo === 'PUT' && l.url.includes('/api/attendance/a1'))).toBe(true));
    expect(llamadas.find((l) => l.metodo === 'PUT')!.cuerpo).toContain('"status":"T"');
  });

  it('borrar pide confirmacion y no borra si se cancela', async () => {
    const metodos: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method) metodos.push(init.method);
      return respuesta(DETALLE);
    }));
    vi.stubGlobal('confirm', vi.fn(() => false));

    pintar();
    await screen.findByText('ANA LOPEZ');
    const fila = screen.getByText('ANA LOPEZ').closest('li') as HTMLElement;
    await userEvent.click(within(fila).getByRole('button', { name: /borrar/i }));

    expect(metodos).not.toContain('DELETE');
  });

  it('borrar con confirmacion aceptada envia el DELETE de ese registro', async () => {
    const llamadas: { url: string; metodo?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, metodo: init?.method });
      return respuesta(DETALLE);
    }));
    vi.stubGlobal('confirm', vi.fn(() => true));

    pintar();
    await screen.findByText('ANA LOPEZ');
    const fila = screen.getByText('ANA LOPEZ').closest('li') as HTMLElement;
    await userEvent.click(within(fila).getByRole('button', { name: /borrar/i }));

    await waitFor(() => expect(llamadas.some(
      (l) => l.metodo === 'DELETE' && l.url.includes('/api/attendance/a1'))).toBe(true));
  });

  it('si la carga falla lo dice en vez de mostrar una lista vacia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    pintar();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
