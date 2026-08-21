import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PanelCalendario from './PanelCalendario';

const DIAS = [
  { calendarDate: '2026-09-14', dayType: 'LECTIVO' },
  { calendarDate: '2026-09-15', dayType: 'LECTIVO' },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('PanelCalendario', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify(
      { token: 't', refreshToken: 'r', role: 'ADMIN', fullName: 'Admin', userId: 1 }));
  });

  it('lista los dias del rango con su tipo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DIAS)));
    render(<PanelCalendario />);
    expect(await screen.findByLabelText('Tipo de dia para 2026-09-14')).toHaveValue('LECTIVO');
    expect(screen.getByLabelText('Tipo de dia para 2026-09-15')).toHaveValue('LECTIVO');
  });

  it('cambiar un dia a SUSPENDIDO manda el PUT correcto', async () => {
    const llamadas: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        llamadas.push({ url, body: JSON.parse(String(init.body)) });
        return respuesta({});
      }
      return respuesta(DIAS);
    }));

    render(<PanelCalendario />);
    const selector = await screen.findByLabelText('Tipo de dia para 2026-09-14');
    await userEvent.selectOptions(selector, 'SUSPENDIDO');

    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].url).toContain('/api/calendar/school-days/2026-09-14');
    expect(llamadas[0].body).toMatchObject({ dayType: 'SUSPENDIDO' });
  });

  it('si el servidor falla lo dice en vez de fingir que guardo', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response('', { status: 500 });
      return respuesta(DIAS);
    }));

    render(<PanelCalendario />);
    const selector = await screen.findByLabelText('Tipo de dia para 2026-09-14');
    await userEvent.selectOptions(selector, 'SUSPENDIDO');

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo actualizar/i);
  });

  it('marca un rango completo con un solo PUT', async () => {
    const llamadas: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        llamadas.push({ url, body: JSON.parse(String(init.body)) });
        return respuesta({ cambiados: 3 });
      }
      return respuesta(DIAS);
    }));

    render(<PanelCalendario />);
    await userEvent.click(await screen.findByRole('button', { name: /marcar un rango/i }));
    await userEvent.type(screen.getByLabelText('Rango desde'), '2026-09-07');
    await userEvent.type(screen.getByLabelText('Rango hasta'), '2026-09-09');
    await userEvent.selectOptions(screen.getByLabelText('Tipo del rango'), 'SUSPENDIDO');
    await userEvent.type(screen.getByLabelText('Motivo del rango'), 'Paro');
    await userEvent.click(screen.getByRole('button', { name: /aplicar al rango/i }));

    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].url).toContain('/api/calendar/school-days');
    expect(llamadas[0].body).toEqual({
      from: '2026-09-07', to: '2026-09-09',
      dayType: 'SUSPENDIDO', description: 'Paro', soloHabiles: true,
    });
  });

  it('dice cuantos dias cambio, para que el rector vea si fueron los que esperaba', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return respuesta({ cambiados: 3 });
      return respuesta(DIAS);
    }));

    render(<PanelCalendario />);
    await userEvent.click(await screen.findByRole('button', { name: /marcar un rango/i }));
    await userEvent.type(screen.getByLabelText('Rango desde'), '2026-09-07');
    await userEvent.type(screen.getByLabelText('Rango hasta'), '2026-09-09');
    await userEvent.click(screen.getByRole('button', { name: /aplicar al rango/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/3 dias/i);
  });
});
