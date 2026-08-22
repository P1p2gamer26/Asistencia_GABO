import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CambiarClave from './CambiarClave';

describe('CambiarClave', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'DOCENTE',
      fullName: 'Francisco Palacios', userId: 3, mustChangePassword: true,
    }));
  });

  it('avisa si las dos claves nuevas no coinciden, sin llamar al servidor', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    render(<CambiarClave />);

    await userEvent.type(screen.getByLabelText(/actual/i), 'cambiar123');
    await userEvent.type(screen.getByLabelText(/^nueva/i), 'unaClaveNueva');
    await userEvent.type(screen.getByLabelText(/repetir/i), 'otraDistinta');
    await userEvent.click(screen.getByRole('button', { name: /cambiar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no coinciden/i);
    expect(f).not.toHaveBeenCalled();
  });

  it('avisa si la nueva es demasiado corta, sin llamar al servidor', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    render(<CambiarClave />);

    await userEvent.type(screen.getByLabelText(/actual/i), 'cambiar123');
    await userEvent.type(screen.getByLabelText(/^nueva/i), 'corta');
    await userEvent.type(screen.getByLabelText(/repetir/i), 'corta');
    await userEvent.click(screen.getByRole('button', { name: /cambiar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/8 caracteres/i);
    expect(f).not.toHaveBeenCalled();
  });

  it('con datos correctos manda el cambio al servidor', async () => {
    const f = vi.fn(async (..._args: unknown[]) => new Response('', { status: 204 }));
    vi.stubGlobal('fetch', f);
    render(<CambiarClave />);

    await userEvent.type(screen.getByLabelText(/actual/i), 'cambiar123');
    await userEvent.type(screen.getByLabelText(/^nueva/i), 'unaClaveNueva');
    await userEvent.type(screen.getByLabelText(/repetir/i), 'unaClaveNueva');
    await userEvent.click(screen.getByRole('button', { name: /cambiar/i }));

    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(String(f.mock.calls[0][0])).toContain('/api/auth/change-password');
  });

  it('si el servidor dice que la actual no coincide, lo muestra', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    render(<CambiarClave />);

    await userEvent.type(screen.getByLabelText(/actual/i), 'equivocada');
    await userEvent.type(screen.getByLabelText(/^nueva/i), 'unaClaveNueva');
    await userEvent.type(screen.getByLabelText(/repetir/i), 'unaClaveNueva');
    await userEvent.click(screen.getByRole('button', { name: /cambiar/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/actual/i));
  });
});
