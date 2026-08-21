import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BannerEstado from './BannerEstado';

describe('BannerEstado', () => {
  it('no muestra nada cuando hay conexion y no queda nada pendiente', () => {
    const { container } = render(
      <BannerEstado online={true} pendientes={0} onSincronizar={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('avisa cuando no hay conexion', () => {
    render(<BannerEstado online={false} pendientes={0} onSincronizar={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(/sin conexion/i);
  });

  it('sin conexion no ofrece el boton de enviar', () => {
    render(<BannerEstado online={false} pendientes={5} onSincronizar={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('con conexion y pendientes ofrece enviar y avisa cuantos', async () => {
    const enviar = vi.fn();
    render(<BannerEstado online={true} pendientes={3} onSincronizar={enviar} />);
    expect(screen.getByRole('status')).toHaveTextContent('3');
    await userEvent.click(screen.getByRole('button', { name: /enviar ahora/i }));
    expect(enviar).toHaveBeenCalledOnce();
  });
});
