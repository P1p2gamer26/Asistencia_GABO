import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BotonInstalar from './BotonInstalar';

function dispararPrompt() {
  const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void> };
  e.prompt = vi.fn(async () => {});
  window.dispatchEvent(e);
  return e;
}

describe('BotonInstalar', () => {
  it('en un navegador que puede instalar, ofrece instalar', async () => {
    render(<BotonInstalar />);
    const evento = dispararPrompt();
    const boton = await screen.findByRole('button', { name: /instalar/i });
    await userEvent.click(boton);
    expect(evento.prompt).toHaveBeenCalled();
  });

  it('en iPhone no hay evento, asi que explica como se hace a mano', () => {
    // Safari no implementa beforeinstallprompt: sin este texto, en iPhone no hay
    // ninguna pista de que la aplicacion se puede instalar.
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'iPhone Safari' });
    render(<BotonInstalar />);
    expect(screen.getByText(/compartir/i)).toBeInTheDocument();
    expect(screen.getByText(/pantalla de inicio/i)).toBeInTheDocument();
  });
});
