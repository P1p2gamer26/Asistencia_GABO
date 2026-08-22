import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Calendario from './Calendario';

const DIAS = [
  { calendarDate: '2026-08-03', dayType: 'LECTIVO' },
  { calendarDate: '2026-08-04', dayType: 'LECTIVO' },
  { calendarDate: '2026-08-07', dayType: 'FESTIVO', description: 'Batalla de Boyaca' },
  { calendarDate: '2026-08-17', dayType: 'FESTIVO', description: 'Asuncion' },
  { calendarDate: '2026-08-19', dayType: 'SUSPENDIDO', description: 'Paro de transporte' },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Calendario', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'DOCENTE',
      fullName: 'Docente', userId: 3, mustChangePassword: false,
    }));
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DIAS)));
  });

  it('pinta los dias del mes en una cuadricula', async () => {
    render(<Calendario />);
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());
    expect(within(screen.getByRole('grid')).getByText('3')).toBeInTheDocument();
  });

  it('dice por escrito que es cada dia no lectivo, no solo con color', async () => {
    render(<Calendario />);
    // Distinguir festivo de vacaciones solo por el tono es el error que ya se corrigio
    // en las graficas: cada dia especial lleva su etiqueta.
    await waitFor(() =>
      expect(screen.getByLabelText(/^7 de agosto.*festivo/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/^19 de agosto.*suspendido/i)).toBeInTheDocument();
  });

  it('no confunde el 7 de agosto con el 17 al buscar por etiqueta', async () => {
    // Los dos son festivos: sin ancla, un regex como /7 de agosto/ tambien casa con
    // "17 de agosto" y getByLabelText revienta con multiples coincidencias.
    render(<Calendario />);
    const dia7 = await waitFor(() => screen.getByLabelText(/^7 de agosto: festivo/i));
    const dia17 = screen.getByLabelText(/^17 de agosto: festivo/i);
    expect(dia7).not.toBe(dia17);
  });

  it('muestra el motivo cuando lo hay', async () => {
    render(<Calendario />);
    await waitFor(() =>
      expect(screen.getByText(/Batalla de Boyaca/)).toBeInTheDocument());
  });

  it('cuenta cuantos dias de clase tiene el mes', async () => {
    render(<Calendario />);
    await waitFor(() => expect(screen.getByText(/2 dias de clase/i)).toBeInTheDocument());
  });

  it('un docente no puede cambiar el calendario', async () => {
    render(<Calendario />);
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('coordinacion si puede cambiar el tipo de un dia', async () => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'COORDINADOR',
      fullName: 'Coordinacion', userId: 2, mustChangePassword: false,
    }));
    const puts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { puts.push(String(url)); return respuesta({}); }
      return respuesta(DIAS);
    }));

    render(<Calendario />);
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0));
    await userEvent.selectOptions(
      screen.getByLabelText(/tipo de dia para 2026-08-03/i), 'SUSPENDIDO');

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(String(puts[0])).toContain('/api/calendar/school-days/2026-08-03');
  });

  it('sin conexion lo dice en vez de mostrar un mes vacio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    render(<Calendario />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i));
  });
});
