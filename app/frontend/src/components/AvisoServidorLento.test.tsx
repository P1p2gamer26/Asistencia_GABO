import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// servidorLento() es estado de modulo: aqui se reemplaza por una variable que la
// prueba mueve a mano y que el evento 'servidor-lento' hace releer al componente.
const mockLento = vi.hoisted(() => ({ v: false }));
vi.mock('../api/client', () => ({ servidorLento: () => mockLento.v }));

import AvisoServidorLento from './AvisoServidorLento';

const TEXTO = 'Conectando con el servidor... si es la primera entrada del dia puede tardar hasta 3 minutos. Lo que marque se guarda en este dispositivo.';

describe('AvisoServidorLento', () => {
  it('vacio al inicio, aparece con el evento en true y desaparece con el evento en false', () => {
    mockLento.v = false;
    render(<AvisoServidorLento />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      mockLento.v = true;
      window.dispatchEvent(new Event('servidor-lento'));
    });
    const franja = screen.getByRole('status');
    expect(franja).toHaveClass('barra-offline', 'aviso');
    expect(franja).toHaveTextContent(TEXTO);

    act(() => {
      mockLento.v = false;
      window.dispatchEvent(new Event('servidor-lento'));
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
