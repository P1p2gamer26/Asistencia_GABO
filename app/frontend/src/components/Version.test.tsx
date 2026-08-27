import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Version from './Version';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

describe('Version', () => {
  it('muestra la version instalada', () => {
    render(<Version />);
    // Sin esto, "a mi no me funciona" no se puede diagnosticar: nadie sabe que
    // version tiene ese telefono.
    expect(screen.getByText(/v\d+\.\d+\.\d+/)).toBeInTheDocument();
  });
});
