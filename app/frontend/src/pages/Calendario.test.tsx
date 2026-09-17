import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Calendario from './Calendario';

/** Fecha fija: ningun test depende del reloj real. */
const HOY = new Date(2026, 7, 15);

const DIAS = [
  { calendarDate: '2026-08-03', dayType: 'LECTIVO', cycleDay: 1 },
  { calendarDate: '2026-08-04', dayType: 'LECTIVO', cycleDay: 2, cycleDayFixed: 2 },
  { calendarDate: '2026-08-07', dayType: 'FESTIVO', description: 'Batalla de Boyaca' },
  { calendarDate: '2026-08-17', dayType: 'FESTIVO', description: 'Asuncion' },
  { calendarDate: '2026-08-19', dayType: 'SUSPENDIDO', description: 'Paro de transporte' },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Calendario', () => {
  afterEach(() => { vi.useRealTimers(); });

  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'DOCENTE',
      fullName: 'Docente', userId: 3, mustChangePassword: false,
    }));
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DIAS)));
  });

  it('pinta los dias del mes en una cuadricula', async () => {
    render(<Calendario hoy={HOY} />);
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());
    expect(within(screen.getByRole('grid')).getByText('3')).toBeInTheDocument();
  });

  it('dice por escrito que es cada dia no lectivo, no solo con color', async () => {
    render(<Calendario hoy={HOY} />);
    // Distinguir festivo de vacaciones solo por el tono es el error que ya se corrigio
    // en las graficas: cada dia especial lleva su etiqueta.
    await waitFor(() =>
      expect(screen.getByLabelText(/^7 de agosto.*festivo/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/^19 de agosto.*suspendido/i)).toBeInTheDocument();
  });

  it('no confunde el 7 de agosto con el 17 al buscar por etiqueta', async () => {
    // Los dos son festivos: sin ancla, un regex como /7 de agosto/ tambien casa con
    // "17 de agosto" y getByLabelText revienta con multiples coincidencias.
    render(<Calendario hoy={HOY} />);
    const dia7 = await waitFor(() => screen.getByLabelText(/^7 de agosto: festivo/i));
    const dia17 = screen.getByLabelText(/^17 de agosto: festivo/i);
    expect(dia7).not.toBe(dia17);
  });

  it('muestra el motivo cuando lo hay', async () => {
    render(<Calendario hoy={HOY} />);
    await waitFor(() =>
      expect(screen.getByText(/Batalla de Boyaca/)).toBeInTheDocument());
  });

  it('cuenta cuantos dias de clase tiene el mes', async () => {
    render(<Calendario hoy={HOY} />);
    await waitFor(() => expect(screen.getByText(/2 dias de clase/i)).toBeInTheDocument());
  });

  it('un docente no puede cambiar el calendario', async () => {
    render(<Calendario hoy={HOY} />);
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

    render(<Calendario hoy={HOY} />);
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0));
    await userEvent.selectOptions(
      screen.getByLabelText(/tipo de dia para 2026-08-03/i), 'SUSPENDIDO');

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(String(puts[0])).toContain('/api/calendar/school-days/2026-08-03');
  });

  it('sin conexion lo dice en vez de mostrar un mes vacio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    render(<Calendario hoy={HOY} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i));
  });

  it('pinta agosto de 2026 aunque el reloj del sistema diga otra cosa', async () => {
    // Regresion: Calendario usaba `new Date()` internamente y la suite solo pasaba
    // en agosto. El reloj real ahora dice diciembre y el mes mostrado sigue siendo
    // el que se paso por props, no el del reloj.
    vi.setSystemTime(new Date(2026, 11, 15));
    render(<Calendario hoy={HOY} />);
    await waitFor(() => expect(screen.getByRole('grid'))
      .toHaveAccessibleName(/agosto de 2026/i));
  });

  it('la etiqueta corta de un dia no lectivo se renderiza en el DOM', async () => {
    // jsdom no aplica media queries: esto solo confirma que "Fest." existe en el
    // arbol, no que se vea a 360px en vez del texto largo. Esa parte la comprueba
    // el test siguiente, leyendo el CSS.
    render(<Calendario hoy={HOY} />);
    await waitFor(() => expect(screen.getAllByText('Fest.').length).toBeGreaterThan(0));
  });

  it('en pantalla estrecha la etiqueta larga se oculta y la corta se ve', () => {
    // jsdom no aplica media queries, asi que la regla se comprueba sobre el CSS.
    // Sin esto, invertir o borrar la media query no rompe ningun test y el tipo
    // de dia se queda distinguido solo por color justo en el ancho en que se
    // trabaja (360px), que es exactamente lo que dice evitar el brief.
    const css = readFileSync(join(__dirname, '../styles.css'), 'utf8');
    const estrecha = css.slice(css.indexOf('@media (max-width: 560px)'));
    expect(estrecha).toMatch(/\.calendario-dia \.tipo\s*\{[^}]*display:\s*none/);
    expect(estrecha).toMatch(/\.calendario-dia \.tipo-corto\s*\{[^}]*display:\s*block/);
  });

  it('muestra el dia de ciclo y coordinacion lo puede fijar solo para ese dia', async () => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'COORDINADOR',
      fullName: 'Coord', userId: 1, mustChangePassword: false,
    }));
    const fetchMock = vi.fn(async () => respuesta(DIAS));
    vi.stubGlobal('fetch', fetchMock);
    render(<Calendario hoy={HOY} />);
    await waitFor(() => expect(screen.getByLabelText(/^3 de agosto.*dia 1/i)).toBeInTheDocument());
    expect(screen.getByText('D2*')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Dia de ciclo para 2026-08-03'), '4');
    await userEvent.click(screen.getByRole('button', { name: 'Solo este dia' }));
    const llamada = fetchMock.mock.calls.find(([url]) => String(url).includes('/cycle-day'));
    expect(llamada).toBeTruthy();
    expect(String(llamada![0])).toContain('/api/calendar/school-days/2026-08-03/cycle-day');
    expect(JSON.parse(String((llamada![1] as RequestInit).body)))
      .toEqual({ cycleDay: 4, cascada: false });
  });
});
