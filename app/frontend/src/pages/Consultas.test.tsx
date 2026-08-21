import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Consultas from './Consultas';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(async () => []) },
  apiUrl: (p: string) => p,
  getSession: () => ({ token: 't' }),
}));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) })));
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

async function llenarFechas(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Desde'), '2026-08-18');
  await user.type(screen.getByLabelText('Hasta'), '2026-08-20');
}

describe('Consultas', () => {
  it('ofrece los tres informes', () => {
    render(<Consultas />);
    const tipo = screen.getByLabelText('Informe') as HTMLSelectElement;
    expect([...tipo.options].map((o) => o.value))
      .toEqual(['resumen', 'matriz', 'inasistencias']);
  });

  it('descarga el tipo elegido', async () => {
    const user = userEvent.setup();
    render(<Consultas />);
    await llenarFechas(user);
    await user.selectOptions(screen.getByLabelText('Informe'), 'inasistencias');
    await user.click(screen.getByRole('button', { name: /descargar/i }));
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('tipo=inasistencias');
  });

  it('por defecto descarga el resumen', async () => {
    const user = userEvent.setup();
    render(<Consultas />);
    await llenarFechas(user);
    await user.click(screen.getByRole('button', { name: /descargar/i }));
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('tipo=resumen');
  });
});
