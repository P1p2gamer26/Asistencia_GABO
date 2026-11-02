import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarioSemana from './ConsultasCalendario';

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// Responde segun la ruta: dia, resumen de la semana, semana de un curso y detalle de estudiante.
function mockApi() {
  return vi.fn(async (url: string) => {
    const u = new URL(String(url), 'http://x');
    const desde = u.searchParams.get('from') ?? u.searchParams.get('fecha') ?? '';
    if (u.pathname.endsWith('/api/reports/dia')) {
      return respuesta({
        fecha: desde, cicloDia: 1,
        cursos: [{ grade: '601', bloques: 2, tomados: 1, detalle: [
          { blockNo: 1, subject: 'Matematicas', teacherName: 'Ana Docente', marcas: 1, quienTomo: 'Luisa Registro' },
          { blockNo: 2, subject: 'Ingles', teacherName: 'Pedro Docente', marcas: 0, quienTomo: null },
        ] }],
      });
    }
    if (u.pathname.endsWith('/api/reports/summary')) {
      return respuesta([{ studentId: 1, documentId: '1', fullName: 'Luis Ruiz', grade: '601',
        present: 3, late: 0, absent: 1, evasion: 0, schoolDays: 4, attendanceRate: 75 }]);
    }
    if (u.pathname.endsWith('/api/reports/semana')) {
      return respuesta({
        estudiantes: [{ id: 1, documentId: '1', fullName: 'Luis Ruiz' }],
        dias: [{ fecha: desde, cicloDia: 1, descripcion: null, tipo: 'LECTIVO',
          bloques: [{ blockNo: 1, subject: 'Matematicas', teacherName: 'Ana Docente' }] }],
        marcas: [{ classDate: desde, blockNo: 1, subject: 'Matematicas', teacherName: 'Ana Docente',
          studentId: 1, documentId: '1', fullName: 'Luis Ruiz', status: 'P', comment: null,
          recordedByName: 'Luisa Registro' }],
      });
    }
    if (u.pathname.includes('/api/reports/estudiante/')) {
      return respuesta({ fullName: 'Luis Ruiz', grade: '601', present: 1, late: 0, absent: 0, evasion: 0,
        marcas: [{ classDate: desde, blockNo: 1, subject: 'Matematicas', status: 'P', comment: null,
          recordedByName: 'Luisa Registro', recordedAt: '2026-10-26T12:00:00Z' }] });
    }
    return respuesta([]);
  });
}

// Celda del calendario por su numero de dia (cada celda tambien lleva el dia de la semana).
const celdaDia = (n: number) =>
  screen.getAllByRole('gridcell').find((c) => c.querySelector('.numero')?.textContent === String(n))!;

describe('Consultas por calendario', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ADMIN',
      fullName: 'Administrador', userId: 1, mustChangePassword: false,
    }));
  });

  it('por dia es el modo por defecto: al tocar un dia pasa a los salones con bloques y tomados', async () => {
    const fetchMock = mockApi();
    vi.stubGlobal('fetch', fetchMock);
    render(<CalendarioSemana setError={() => {}} />);

    expect(screen.getByRole('button', { name: 'Por dia' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(celdaDia(1));

    const salon = await screen.findByRole('button', { name: /Salón 601/ });
    expect(salon).toHaveTextContent('1 de 2 bloques tomados');
    // Al estar en los salones, el calendario ya no se ve.
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.includes('/api/reports/dia?fecha='))).toBe(true);
  });

  it('abrir un salon muestra sus bloques con quien tomo y luego los estudiantes, con boton de volver', async () => {
    vi.stubGlobal('fetch', mockApi());
    render(<CalendarioSemana setError={() => {}} />);
    fireEvent.click(celdaDia(1));
    fireEvent.click(await screen.findByRole('button', { name: /Salón 601/ }));

    expect(await screen.findByText(/Bloque 1 · Matematicas · Ana Docente · Tomada por Luisa Registro/)).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver más detalle' })).toBeInTheDocument();
    // Los salones desaparecen y hay boton para volver a ellos.
    expect(screen.queryByRole('button', { name: /Salón 601/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Volver a los salones/ })).toBeInTheDocument();
  });

  it('ver mas detalle muestra quien registro cada marca y se puede volver', async () => {
    vi.stubGlobal('fetch', mockApi());
    render(<CalendarioSemana setError={() => {}} />);
    fireEvent.click(celdaDia(1));
    fireEvent.click(await screen.findByRole('button', { name: /Salón 601/ }));

    fireEvent.click(await screen.findByRole('button', { name: 'Ver más detalle' }));
    await waitFor(() => expect(screen.getByText('Registrado por')).toBeInTheDocument());
    expect(screen.getByText('Luisa Registro')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Volver a los estudiantes/ }));
    expect(screen.queryByText('Registrado por')).not.toBeInTheDocument();
  });

  it('volver al calendario desde los salones', async () => {
    vi.stubGlobal('fetch', mockApi());
    render(<CalendarioSemana setError={() => {}} />);
    fireEvent.click(celdaDia(1));
    await screen.findByRole('button', { name: /Salón 601/ });
    fireEvent.click(screen.getByRole('button', { name: /Volver al calendario/ }));
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('por semana: elige la semana, lista los salones y ofrece el Excel', async () => {
    vi.stubGlobal('fetch', mockApi());
    render(<CalendarioSemana setError={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Por semana' }));
    fireEvent.click(celdaDia(1));
    fireEvent.click(screen.getByRole('button', { name: /Consultar la semana/ }));

    expect(await screen.findByRole('button', { name: /Salón 601/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Descargar Excel de la semana/ })).toBeInTheDocument();
  });

  it('el calendario muestra todos los dias del mes, cada uno con su dia de la semana', () => {
    render(<CalendarioSemana setError={() => {}} />);
    const hoy = new Date();
    const diasDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const celdas = screen.getAllByRole('gridcell').filter((c) => c.querySelector('.numero'));
    expect(celdas.length).toBe(diasDelMes);
    expect(celdas[0].querySelector('.dia-semana')).toBeInTheDocument();
  });
});
