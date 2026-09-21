import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false, vi.fn()], updateServiceWorker: vi.fn() }),
}));

import Version from './Version';

describe('Version', () => {
  it('muestra la version instalada', () => {
    render(<Version />);
    // Sin esto, "a mi no me funciona" no se puede diagnosticar: nadie sabe que
    // version tiene ese telefono.
    expect(screen.getByText(/v\d+\.\d+\.\d+/)).toBeInTheDocument();
  });

  it('ya no hay boton de actualizar: la version nueva se aplica sola', () => {
    render(<Version />);
    expect(screen.queryByRole('button', { name: /actualizar/i })).toBeNull();
  });
});
