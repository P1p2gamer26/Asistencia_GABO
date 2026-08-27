import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// needRefresh varia por prueba: [false,...] no debe mostrar boton, [true,...] si.
// Patron igual al de BarraOffline.test.tsx: vi.hoisted() para que el mock lo lea.
const mockUpdateServiceWorker = vi.hoisted(() => vi.fn());
const mockNeedRefresh = vi.hoisted(() => ({ valor: false }));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [mockNeedRefresh.valor, vi.fn()],
    updateServiceWorker: mockUpdateServiceWorker,
  }),
}));

import Version from './Version';

describe('Version', () => {
  it('muestra la version instalada', () => {
    mockNeedRefresh.valor = false;
    render(<Version />);
    // Sin esto, "a mi no me funciona" no se puede diagnosticar: nadie sabe que
    // version tiene ese telefono.
    expect(screen.getByText(/v\d+\.\d+\.\d+/)).toBeInTheDocument();
  });

  it('sin version nueva no ofrece el boton de actualizar', () => {
    mockNeedRefresh.valor = false;
    render(<Version />);
    expect(screen.queryByRole('button', { name: /actualizar/i })).toBeNull();
  });

  it('con version nueva ofrece el boton de actualizar', () => {
    mockNeedRefresh.valor = true;
    render(<Version />);
    expect(screen.getByRole('button', { name: /actualizar/i })).toBeInTheDocument();
  });

  it('al pulsar el boton, actualiza el service worker forzando la recarga', () => {
    mockNeedRefresh.valor = true;
    mockUpdateServiceWorker.mockClear();
    render(<Version />);
    screen.getByRole('button', { name: /actualizar/i }).click();
    // El argumento true importa: sin el, el service worker se activa pero la
    // pestana sigue con el codigo viejo.
    expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true);
  });
});
