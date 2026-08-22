import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import LimiteDeError from './LimiteDeError';

function Explota(): JSX.Element {
  throw new Error('fallo de renderizado');
}

describe('LimiteDeError', () => {
  // React escribe el error en consola aunque lo capturemos; se silencia para que la
  // salida de los tests no parezca rota.
  let spy: ReturnType<typeof vi.spyOn>;
  beforeAll(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterAll(() => { spy.mockRestore(); });

  it('deja pasar a los hijos cuando no hay error', () => {
    render(<LimiteDeError><p>contenido normal</p></LimiteDeError>);
    expect(screen.getByText('contenido normal')).toBeInTheDocument();
  });

  it('ante un fallo muestra un mensaje en vez de dejar la pantalla en blanco', () => {
    render(<LimiteDeError><Explota /></LimiteDeError>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('le dice al docente que su asistencia no se perdio', () => {
    render(<LimiteDeError><Explota /></LimiteDeError>);
    // Es lo que mas necesita saber en ese momento.
    expect(screen.getByRole('alert')).toHaveTextContent(/no se perdio|guardada/i);
  });

  it('ofrece recargar', () => {
    render(<LimiteDeError><Explota /></LimiteDeError>);
    expect(screen.getByRole('button', { name: /recargar/i })).toBeInTheDocument();
  });
});
