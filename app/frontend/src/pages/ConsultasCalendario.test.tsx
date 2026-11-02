import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarioSemana from './ConsultasCalendario';

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// Responde segun la ruta: resumen de la semana, semana de un curso y detalle de estudiante.
function mockApi() {
  return vi.fn(async (url: string) => {
    const u = new URL(String(url), 'http://x');
    const lunes = u.searchParams.get('from') ?? '';
    if (u.pathname.endsWith('/api/reports/summary')) {
      return respuesta([{ studentId: 1, documentId: '1', fullName: 'Luis Ruiz', grade: '601',
        present: 3, late: 0, absent: 1, evasion: 0, schoolDays: 4, attendanceRate: 75 }]);
    }
    if (u.pathname.endsWith('/api/reports/semana')) {
      return respuesta({
        estudiantes: [{ id: 1, documentId: '1', fullName: 'Luis Ruiz' }],
        dias: [{ fecha: lunes, cicloDia: 1, descripcion: null, tipo: 'LECTIVO',
          bloques: [{ blockNo: 1, subject: 'Matematicas', teacherName: 'Ana Docente' }] }],
        marcas: [{ classDate: lunes, blockNo: 1, subject: 'Matematicas', teacherName: 'Ana Docente',
          studentId: 1, documentId: '1', fullName: 'Luis Ruiz', status: 'P', comment: null,
          recordedByName: 'Luisa Registro' }],
      });
    }
    if (u.pathname.includes('/api/reports/estudiante/')) {
      return respuesta({ fullName: 'Luis Ruiz', grade: '601', present: 1, late: 0, absent: 0, evasion: 0,
        marcas: [{ classDate: lunes, blockNo: 1, subject: 'Matematicas', status: 'P', comment: null,
          recordedByName: 'Luisa Registro', recordedAt: '2026-10-26T12:00:00Z' }] });
    }
    return respuesta([]);
  });
}

describe('Consultas por calendario', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ADMIN',
      fullName: 'Administrador', userId: 1, mustChangePassword: false,
    }));
  });

  it('elige una semana, lista los salones y abre un curso con quien tomo cada bloque', async () => {
    const fetchMock = mockApi();
    vi.stubGlobal('fetch', fetchMock);
    render(<CalendarioSemana setError={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Consultar semana' }));

    const salon = await screen.findByRole('button', { name: /601/ });
    const llamada = fetchMock.mock.calls.map((c) => String(c[0])).find((x) => x.includes('/summary'))!;
    expect(llamada).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);

    fireEvent.click(salon);
    expect(await screen.findByText(/Bloque 1 · Matematicas · Ana Docente · Tomada por Luisa Registro/)).toBeInTheDocument();
  });

  it('ver mas detalle muestra quien registro cada marca del estudiante', async () => {
    vi.stubGlobal('fetch', mockApi());
    render(<CalendarioSemana setError={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Consultar semana' }));
    fireEvent.click(await screen.findByRole('button', { name: /601/ }));

    fireEvent.click(await screen.findByRole('button', { name: 'Ver más detalle' }));
    await waitFor(() => expect(screen.getByText('Registrado por')).toBeInTheDocument());
    expect(screen.getByText('Luisa Registro')).toBeInTheDocument();
  });

  it('ofrece el Excel de la semana con una hoja por curso', async () => {
    vi.stubGlobal('fetch', mockApi());
    render(<CalendarioSemana setError={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Consultar semana' }));
    expect(await screen.findByRole('button', { name: /Descargar Excel de la semana/ })).toBeInTheDocument();
  });
});
