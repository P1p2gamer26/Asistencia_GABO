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
      token: 't', refreshToken: 'r', role: 'ADMIN',
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
    const llamadas = f.mock.calls.map((c) => String(c[0]));
    expect(llamadas.some((url) => url.includes('/api/reports/summary') && url.includes('grade=601')))
      .toBe(true);
  });

  it('los encabezados dejan claro que P/T/F/E son marcas por clase, no dias', async () => {
    const f = vi.fn(async () => respuesta(FILAS));
    vi.stubGlobal('fetch', f);
    render(<Consultas />);

    await waitFor(() => expect(screen.getByRole('option', { name: '601' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await userEvent.type(screen.getByLabelText(/desde/i), '2026-02-01');
    await userEvent.type(screen.getByLabelText(/hasta/i), '2026-06-30');
    await userEvent.click(screen.getByRole('button', { name: /^consultar/i }));

    await waitFor(() => expect(screen.getByText('ANA LOPEZ')).toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: 'Dias lectivos' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'P (clases)' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '% Asistencia' })).toBeInTheDocument();
  });

  it('un estudiante sin ninguna marca no muestra un porcentaje inventado', async () => {
    const sinDatos = [
      { studentId: 9, documentId: '999', fullName: 'SIN DATOS PEREZ', grade: '607',
        present: 0, late: 0, absent: 0, evasion: 0, schoolDays: 12 },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(sinDatos)));
    render(<Consultas />);

    await waitFor(() => expect(screen.getByRole('option', { name: '607' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '607');
    await userEvent.type(screen.getByLabelText(/desde/i), '2026-08-01');
    await userEvent.type(screen.getByLabelText(/hasta/i), '2026-08-22');
    await userEvent.click(screen.getByRole('button', { name: /^consultar/i }));

    await waitFor(() => expect(screen.getByText('SIN DATOS PEREZ')).toBeInTheDocument());
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('avisa cuando hay dias no lectivos con marcas en el periodo consultado', async () => {
    const f = vi.fn(async (url: string) => {
      if (String(url).includes('/dias-no-lectivos-con-marcas')) {
        return respuesta([{ fecha: '2026-08-03', tipo: 'SUSPENDIDO', marcas: 180 }]);
      }
      return respuesta(FILAS);
    });
    vi.stubGlobal('fetch', f);
    render(<Consultas />);

    await waitFor(() => expect(screen.getByRole('option', { name: '601' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await userEvent.type(screen.getByLabelText(/desde/i), '2026-08-01');
    await userEvent.type(screen.getByLabelText(/hasta/i), '2026-08-22');
    await userEvent.click(screen.getByRole('button', { name: /^consultar/i }));

    await waitFor(() => expect(screen.getByText(/dia.* no lectivo.* con asistencia/i))
      .toBeInTheDocument());
    expect(screen.getByText(/2026-08-03/)).toBeInTheDocument();
    expect(screen.getByText(/SUSPENDIDO/)).toBeInTheDocument();
  });

  it('sin dias no lectivos con marcas, no aparece el aviso', async () => {
    const f = vi.fn(async (url: string) => {
      if (String(url).includes('/dias-no-lectivos-con-marcas')) return respuesta([]);
      return respuesta(FILAS);
    });
    vi.stubGlobal('fetch', f);
    render(<Consultas />);

    await waitFor(() => expect(screen.getByRole('option', { name: '601' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await userEvent.type(screen.getByLabelText(/desde/i), '2026-02-01');
    await userEvent.type(screen.getByLabelText(/hasta/i), '2026-06-30');
    await userEvent.click(screen.getByRole('button', { name: /^consultar/i }));

    await waitFor(() => expect(screen.getByText('ANA LOPEZ')).toBeInTheDocument());
    expect(screen.queryByText(/dia.* no lectivo.* con asistencia/i)).not.toBeInTheDocument();
  });

  it('la descarga en Excel si permite todos los cursos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(FILAS)));
    render(<Consultas />);
    // Los campos ya traen el mes en curso por defecto: se limpian antes de escribir.
    await userEvent.clear(screen.getByLabelText(/desde/i));
    await userEvent.type(screen.getByLabelText(/desde/i), '2026-02-01');
    await userEvent.clear(screen.getByLabelText(/hasta/i));
    await userEvent.type(screen.getByLabelText(/hasta/i), '2026-06-30');
    // Sin curso elegido, el Excel sigue disponible: 64 KB y es la herramienta
    // correcta para analizar el colegio entero.
    expect(screen.getByRole('button', { name: /excel/i })).not.toBeDisabled();
  });

  it('por estudiante: busca, elige y muestra las marcas con quien las registro', async () => {
    const f = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/estudiantes?q=')) return respuesta([{ id: 7, documentId: '777', fullName: 'CARLA MORA', grade: '702' }]);
      if (u.includes('/estudiante/7')) return respuesta({
        id: 7, documentId: '777', fullName: 'CARLA MORA', grade: '702',
        present: 1, late: 0, absent: 1, evasion: 0,
        marcas: [{ classDate: '2026-06-02', blockNo: 3, subject: 'Ciencias', status: 'F',
                   comment: null, recordedByName: 'Coordinacion', recordedAt: '2026-06-02T12:00:00Z' }],
      });
      return respuesta(FILAS);
    });
    vi.stubGlobal('fetch', f);
    render(<Consultas />);

    await userEvent.click(screen.getByRole('button', { name: /por estudiante/i }));
    await userEvent.type(screen.getByLabelText(/estudiante/i), 'carla');
    await userEvent.click(await screen.findByRole('button', { name: /CARLA MORA/ }));

    await waitFor(() => expect(screen.getByText('Coordinacion')).toBeInTheDocument());
    expect(screen.getByText('Ciencias')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: /F Falta/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /excel del estudiante/i })).toBeInTheDocument();
  });

  it('tomas de asistencia: lista quien tomo cada lista y resalta cuando no fue el titular', async () => {
    const f = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/docentes')) return respuesta([{ id: 3, fullName: 'Francisco Palacios' }]);
      if (u.includes('/tomas?')) return respuesta([{
        classDate: '2026-06-02', grade: '601', blockNo: 1, subject: 'Matematicas',
        teacherName: 'Francisco Palacios', recordedByName: 'Coordinacion',
        lastRecordedAt: '2026-06-02T12:00:00Z', total: 38, absent: 2, evasion: 0,
      }]);
      return respuesta(FILAS);
    });
    vi.stubGlobal('fetch', f);
    render(<Consultas />);

    await userEvent.click(screen.getByRole('button', { name: /tomas de asistencia/i }));
    await waitFor(() => expect(screen.getByText('Matematicas')).toBeInTheDocument());
    expect(screen.getByText('Coordinacion')).toHaveClass('distinto');
    expect(screen.getByRole('option', { name: 'Francisco Palacios' })).toBeInTheDocument();
  });
});
