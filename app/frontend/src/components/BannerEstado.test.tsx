import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BannerEstado from './BannerEstado';

describe('BannerEstado', () => {
  it('no muestra nada cuando hay conexion y no queda nada pendiente', () => {
    const { container } = render(
      <BannerEstado online={true} alcanzable={true} pendientes={0} onSincronizar={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('avisa cuando no hay conexion', () => {
    render(<BannerEstado online={false} alcanzable={false} pendientes={0} onSincronizar={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(/sin conexion/i);
  });

  it('sin conexion no ofrece el boton de enviar', () => {
    render(<BannerEstado online={false} alcanzable={false} pendientes={5} onSincronizar={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('con conexion y pendientes ofrece enviar y avisa cuantos', async () => {
    const enviar = vi.fn();
    render(<BannerEstado online={true} alcanzable={true} pendientes={3} onSincronizar={enviar} />);
    expect(screen.getByRole('status')).toHaveTextContent('3');
    await userEvent.click(screen.getByRole('button', { name: /enviar ahora/i }));
    expect(enviar).toHaveBeenCalledOnce();
  });

  it('sin salida a internet avisa, aunque el navegador se crea conectado', () => {
    // El caso del colegio: WiFi conectado, sin internet. navigator.onLine dice true.
    render(<BannerEstado online={true} alcanzable={false} pendientes={3}
                         onSincronizar={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(/sin conexion/i);
  });

  it('sin salida no ofrece el boton de enviar', () => {
    render(<BannerEstado online={true} alcanzable={false} pendientes={3}
                         onSincronizar={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('con salida y pendientes si ofrece enviar', () => {
    render(<BannerEstado online={true} alcanzable={true} pendientes={3}
                         onSincronizar={() => {}} />);
    expect(screen.getByRole('button', { name: /enviar ahora/i })).toBeInTheDocument();
  });

  it('con salida y nada pendiente no muestra nada', () => {
    const { container } = render(
      <BannerEstado online={true} alcanzable={true} pendientes={0} onSincronizar={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
