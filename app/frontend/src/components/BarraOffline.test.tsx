import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// El :has() en styles.css reserva espacio en .contenido solo mientras
// ".barra-offline" este realmente en el DOM. jsdom no calcula layout (no puede
// afirmar que el padding se aplique), asi que esta prueba cubre lo que si es honesto
// verificar desde aqui: que el elemento que dispara el selector aparece y desaparece
// con el estado, no que se queda montado (oculto) tapando espacio permanente.
const mockEstado = vi.hoisted(() => ({ pendientes: 0, alcanzable: true }));
vi.mock('../sync/useSincronizacion', () => ({
  useSincronizacion: () => ({ ...mockEstado, sincronizarAhora: vi.fn() }),
}));

import BarraOffline from './BarraOffline';

describe('BarraOffline', () => {
  it('con todo sincronizado no monta la franja: .contenido no reserva espacio', () => {
    mockEstado.pendientes = 0;
    mockEstado.alcanzable = true;
    const { container } = render(<BarraOffline />);
    expect(container.querySelector('.barra-offline')).toBeNull();
  });

  it('con cola pendiente monta la franja: el selector :has() de .contenido se dispara', () => {
    mockEstado.pendientes = 3;
    mockEstado.alcanzable = true;
    render(<BarraOffline />);
    expect(screen.getByRole('status')).toHaveClass('barra-offline');
  });

  it('sin alcance al servidor tambien monta la franja aunque no haya pendientes', () => {
    mockEstado.pendientes = 0;
    mockEstado.alcanzable = false;
    render(<BarraOffline />);
    expect(screen.getByRole('status')).toHaveClass('barra-offline', 'sin-red');
  });
});
