import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InicioAdmin from './InicioAdmin';

const HOY = {
  lectivo: true, fecha: '2026-08-24',
  bloquesEsperados: 36, bloquesMarcados: 12,
  presentes: 320, tarde: 14, ausentes: 22, evasiones: 4,
  ingresos: 380,
};

// Bloques del dia por curso (endpoint /api/reports/dia).
const DIA = {
  fecha: '2026-08-24', cicloDia: 3,
  cursos: [
    { grade: '601', bloques: 2, tomados: 1, detalle: [
      { blockNo: 1, subject: 'Matematicas', teacherName: 'Docente Uno', marcas: 3, quienTomo: 'Docente Uno' },
      { blockNo: 2, subject: 'Ciencias', teacherName: 'Docente Dos', marcas: 0, quienTomo: null },
    ] },
    { grade: '602', bloques: 1, tomados: 1, detalle: [
      { blockNo: 1, subject: 'Ingles', teacherName: 'Docente Tres', marcas: 2, quienTomo: 'Docente Tres' },
    ] },
    { grade: '603', bloques: 1, tomados: 0, detalle: [
      { blockNo: 1, subject: 'Sociales', teacherName: 'Docente Cuatro', marcas: 0, quienTomo: null },
    ] },
  ],
};

// Filas del endpoint de resumen de HOY: una por estudiante.
const RESUMEN_HOY = [
  { studentId: 1, documentId: '1', fullName: 'A', grade: '601', present: 0, late: 0, absent: 1, evasion: 0, schoolDays: 1, attendanceRate: 0 },
  { studentId: 2, documentId: '2', fullName: 'B', grade: '601', present: 0, late: 0, absent: 1, evasion: 1, schoolDays: 1, attendanceRate: 0 },
  { studentId: 3, documentId: '3', fullName: 'C', grade: '602', present: 1, late: 1, absent: 0, evasion: 0, schoolDays: 1, attendanceRate: 100 },
];

const NOVEDADES = {
  evasiones: [
    { studentId: 1, fullName: 'Juan Perez', grade: '601', classDate: '2026-08-24',
      subject: 'Matematicas', comment: 'se salio del salon' },
  ],
  // Las ausencias vienen agrupadas por estudiante+dia (no por bloque), sin una
  // sola materia: el backend informa cobertura ("dia completo" o "N de M").
  ausencias: [
    { studentId: 2, fullName: 'Ana Gomez', grade: '602', classDate: '2026-08-24',
      subject: null, comment: 'Falto el dia completo' },
  ],
  sinRegistros: false,
};

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function mockFetch(hoy: unknown = HOY, novedades: unknown = NOVEDADES,
                   dia: unknown = DIA, resumen: unknown = RESUMEN_HOY) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('/novedades')) return respuesta(novedades);
    if (String(url).includes('/summary')) return respuesta(resumen);
    if (String(url).includes('/reports/dia')) return respuesta(dia);
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
    await waitFor(() => expect(screen.getAllByText('22').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/ausentes hoy/i).length).toBeGreaterThan(0);
  });

  it('no muestra datos del mes en la pantalla de inicio', async () => {
    // El mes vive en Consultas y en el Tablero, no en el inicio.
    vi.stubGlobal('fetch', mockFetch());
    pintar();
    await waitFor(() => expect(screen.getByText(/12 de 36/)).toBeInTheDocument());
    expect(screen.queryByText(/asistencia del mes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dias lectivos transcurridos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/en lo que va del mes/i)).not.toBeInTheDocument();
  });

  it('muestra todos los cursos del dia, tambien los que no tienen marcas', async () => {
    vi.stubGlobal('fetch', mockFetch());
    pintar();
    await screen.findByRole('link', { name: '601' });
    expect(screen.getByRole('link', { name: '602' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '603' })).toBeInTheDocument();
  });

  it('muestra los bloques pendientes del curso con materia y docente', async () => {
    vi.stubGlobal('fetch', mockFetch());
    pintar();
    await waitFor(() => expect(screen.getByText(/Bloque 2 · Ciencias · Docente Dos/)).toBeInTheDocument());
    expect(screen.getByText(/Bloque 1 · Sociales · Docente Cuatro/)).toBeInTheDocument();
  });

  it('cuando el dia no tiene cursos, la tabla no aparece', async () => {
    vi.stubGlobal('fetch', mockFetch(HOY, NOVEDADES, { ...DIA, cursos: [] }));
    pintar();
    await waitFor(() => expect(screen.getByText(/12 de 36/)).toBeInTheDocument());
    expect(screen.queryByText(/todos los cursos de hoy/i)).not.toBeInTheDocument();
  });

  it('muestra las evasiones y ausencias de hoy con el curso', async () => {
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

  it('sin evasiones ni ausencias hoy lo dice, no se queda mudo', async () => {
    vi.stubGlobal('fetch', mockFetch(HOY, { evasiones: [], ausencias: [], sinRegistros: false }));
    pintar();
    await waitFor(() =>
      expect(screen.getByText(/no hay evasiones registradas hoy/i)).toBeInTheDocument());
    expect(screen.getByText(/no hay ausencias registradas hoy/i)).toBeInTheDocument();
  });

  it('si nadie ha tomado asistencia hoy lo distingue de cero novedades', async () => {
    vi.stubGlobal('fetch', mockFetch(HOY, { evasiones: [], ausencias: [], sinRegistros: true }));
    pintar();
    await waitFor(() =>
      expect(screen.getAllByText(/nadie ha registrado asistencia/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(/no hay evasiones registradas/i)).not.toBeInTheDocument();
  });

  it('un dia no lectivo lo dice y sigue mostrando las novedades', async () => {
    vi.stubGlobal('fetch', mockFetch({
      ...HOY, lectivo: false, bloquesEsperados: 0, bloquesMarcados: 0,
      presentes: 0, tarde: 0, ausentes: 0, evasiones: 0, ingresos: 0,
    }, NOVEDADES, { ...DIA, cursos: [] }));
    pintar();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/hoy no hay clase/i));
    expect(screen.queryByText(/0 de 0/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Juan Perez')).toBeInTheDocument());
  });

  it('sin conexion lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    pintar();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i));
  });

  it('el nombre de un curso lleva a su pagina del dia', async () => {
    vi.stubGlobal('fetch', mockFetch());
    pintar();
    const enlace = await screen.findByRole('link', { name: '601' });
    expect(enlace).toHaveAttribute('href', '/curso/601');
  });

  it('cada curso muestra sus faltas y evasiones de hoy', async () => {
    vi.stubGlobal('fetch', mockFetch());
    pintar();
    await screen.findByRole('link', { name: '601' });
    await waitFor(() => {
      const fila = screen.getByRole('link', { name: '601' }).closest('tr')!;
      // columnas: curso, bloques tomados, P, T, F, E, pendientes
      expect(fila.querySelectorAll('td')[4]).toHaveTextContent('2');
      expect(fila.querySelectorAll('td')[5]).toHaveTextContent('1');
    });
  });
});
