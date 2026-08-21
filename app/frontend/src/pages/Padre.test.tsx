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
