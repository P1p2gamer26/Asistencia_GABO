import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InicioAdmin from './InicioAdmin';

const HOY = {
  lectivo: true, fecha: '2026-08-24',
  bloquesEsperados: 36, bloquesMarcados: 12,
  presentes: 320, tarde: 14, ausentes: 22, evasiones: 4,
  ingresos: 380, mesAsistencia: 94.6, mesDiasLectivos: 16,
  mesPresentes: 900, mesTarde: 40, mesAusentes: 60, mesEvasiones: 8,
  mesPorCurso: [
    { grade: '601', present: 10, late: 1, absent: 5, evasion: 0, attendanceRate: 68.8, sinRegistros: false },
    { grade: '602', present: 20, late: 0, absent: 1, evasion: 0, attendanceRate: 95.2, sinRegistros: false },
    { grade: '603', present: 0, late: 0, absent: 0, evasion: 0, attendanceRate: 0, sinRegistros: true },
  ],
};

const NOVEDADES = {
  evasiones: [
    { studentId: 1, fullName: 'Juan Perez', grade: '601', classDate: '2026-08-20',
      subject: 'Matematicas', comment: 'se salio del salon' },
  ],
  // Las ausencias vienen agrupadas por estudiante+dia (no por bloque), sin una
  // sola materia: el backend informa cobertura ("dia completo" o "N de M").
  ausencias: [
    { studentId: 2, fullName: 'Ana Gomez', grade: '602', classDate: '2026-08-21',
      subject: null, comment: 'Falto el dia completo' },
  ],
  sinRegistros: false,
};

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function mockFetch(hoy: unknown = HOY, novedades: unknown = NOVEDADES) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('/novedades')) return respuesta(novedades);
    return respuesta(hoy);
  });
}

const pintar = () => render(<MemoryRouter><InicioAdmin /></MemoryRouter>);

describe('InicioAdmin', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ADMIN',
      fullName: 'Administrador', userId: 1, mustChangePassword: false,
    }));
  });

  it('lo primero que muestra es cuanto del colegio ha reportado hoy', async () => {
    vi.stubGlobal('fetch', mockFetch());
    pintar();
    // Un 100 % de asistencia sobre 3 bloques de 36 no es buena noticia: por eso la
    // cobertura va antes que el porcentaje.
    await waitFor(() => expect(screen.getByText(/12 de 36/)).toBeInTheDocument());
  });

  it('muestra los estados de hoy', async () => {
    vi.stubGlobal('fetch', mockFetch());
    pintar();
    await waitFor(() => expect(screen.getByText('22')).toBeInTheDocument());
    expect(screen.getByText(/ausentes hoy/i)).toBeInTheDocument();
  });

  it('muestra el mes con sus totales y el desglose por curso', async () => {
    vi.stubGlobal('fetch', mockFetch());
    pintar();
    await waitFor(() => expect(screen.getAllByText(/94.6/).length).toBeGreaterThan(0));
    expect(screen.getByText(/16 dias lectivos/i)).toBeInTheDocument();
    expect(screen.getByText('900')).toBeInTheDocument(); // presentes del mes
    expect(screen.getAllByText('601').length).toBeGreaterThan(0);
    expect(screen.getByText('602')).toBeInTheDocument();
  });

  it('un curso sin registros en el mes no se confunde con 100% de asistencia', async () => {
    vi.stubGlobal('fetch', mockFetch());
    pintar();
    await waitFor(() => expect(screen.getByText('603')).toBeInTheDocument());
    expect(screen.getByText(/sin registros/i)).toBeInTheDocument();
  });

  it('muestra las evasiones y ausencias recientes con el curso', async () => {
    vi.stubGlobal('fetch', mockFetch());
    pintar();
    await waitFor(() => expect(screen.getByText('Juan Perez')).toBeInTheDocument());
    expect(screen.getByText(/curso 601/)).toBeInTheDocument();
    expect(screen.getByText('Ana Gomez')).toBeInTheDocument();
    expect(screen.getByText(/curso 602/)).toBeInTheDocument();
  });

  it('una ausencia de dia completo aparece una sola vez, con el texto de cobertura', async () => {
    // Regresion: el backend agrupa por estudiante+dia; si el frontend volviera a
    // desglosar por materia, Ana Gomez saldria repetida y desplazaria a otros.
    vi.stubGlobal('fetch', mockFetch());
    pintar();
    await waitFor(() => expect(screen.getByText(/falto el dia completo/i)).toBeInTheDocument());
    expect(screen.getAllByText('Ana Gomez')).toHaveLength(1);
  });

  it('sin evasiones ni ausencias en el periodo lo dice, no se queda mudo', async () => {
    vi.stubGlobal('fetch', mockFetch(HOY, { evasiones: [], ausencias: [], sinRegistros: false }));
    pintar();
    await waitFor(() =>
      expect(screen.getByText(/no hay evasiones registradas/i)).toBeInTheDocument());
    expect(screen.getByText(/no hay ausencias registradas/i)).toBeInTheDocument();
  });

  it('si nadie ha tomado asistencia en el periodo lo distingue de cero novedades', async () => {
    vi.stubGlobal('fetch', mockFetch(HOY, { evasiones: [], ausencias: [], sinRegistros: true }));
    pintar();
    await waitFor(() =>
      expect(screen.getAllByText(/nadie ha registrado asistencia/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(/no hay evasiones registradas/i)).not.toBeInTheDocument();
  });

  it('un dia no lectivo lo dice, y ademas muestra el mes y las novedades', async () => {
    vi.stubGlobal('fetch', mockFetch({
      ...HOY, lectivo: false, bloquesEsperados: 0, bloquesMarcados: 0,
      presentes: 0, tarde: 0, ausentes: 0, evasiones: 0, ingresos: 0,
    }));
    pintar();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/hoy no hay clase/i));
    expect(screen.queryByText(/0 de 0/)).not.toBeInTheDocument();
    // La pantalla no se queda vacia un sabado: el mes y las novedades siguen.
    expect(screen.getAllByText(/94.6/).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText('Juan Perez')).toBeInTheDocument());
  });

  it('sin conexion lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    pintar();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i));
  });
});
