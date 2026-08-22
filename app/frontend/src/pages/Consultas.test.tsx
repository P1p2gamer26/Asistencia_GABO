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
    // El montaje carga la lista de cursos (una llamada); eso no cuenta como consulta.
    const llamadasAlMontar = f.mock.calls.length;

    await userEvent.type(screen.getByLabelText(/desde/i), '2026-02-01');
    await userEvent.type(screen.getByLabelText(/hasta/i), '2026-06-30');

    // Con fechas pero sin curso, el boton de consultar sigue deshabilitado.
    expect(screen.getByRole('button', { name: /^consultar/i })).toBeDisabled();
    expect(f.mock.calls.length).toBe(llamadasAlMontar);
  });

  it('explica por que hay que elegir un curso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(FILAS)));
    render(<Consultas />);
    expect(screen.getByText(/elija un curso/i)).toBeInTheDocument();
  });

  it('con curso y fechas si consulta y pinta las filas', async () => {
    const f = vi.fn(async (_url: string) => respuesta(FILAS));
    vi.stubGlobal('fetch', f);
    render(<Consultas />);

    await waitFor(() => expect(screen.getByRole('option', { name: '601' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await userEvent.type(screen.getByLabelText(/desde/i), '2026-02-01');
    await userEvent.type(screen.getByLabelText(/hasta/i), '2026-06-30');
    await userEvent.click(screen.getByRole('button', { name: /^consultar/i }));

    await waitFor(() => expect(screen.getByText('ANA LOPEZ')).toBeInTheDocument());
    const ultimaLlamada = f.mock.lastCall![0];
    expect(String(ultimaLlamada)).toContain('grade=601');
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
