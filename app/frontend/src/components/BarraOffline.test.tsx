import { render, screen, waitFor } from '@testing-library/react';
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

// La franja tambien consulta el estado de la copia local. Se mockea aparte de
// useSincronizacion para no depender de IndexedDB: aqui se fija a "hay datos
// recientes" salvo que el caso lo cambie explicitamente.
const mockDatos = vi.hoisted(() => ({ descargado: new Date().toISOString(), dias: 0, estudiantes: 10 }));
vi.mock('../sync/engine', () => ({
  estadoDeDatos: () => Promise.resolve(mockDatos),
}));

import BarraOffline from './BarraOffline';

describe('BarraOffline', () => {
  it('con todo sincronizado no monta la franja: .contenido no reserva espacio', async () => {
    mockEstado.pendientes = 0;
    mockEstado.alcanzable = true;
    mockDatos.dias = 0;
    mockDatos.estudiantes = 10;
    const { container } = render(<BarraOffline />);
    // Espera a que se resuelva la consulta de estadoDeDatos antes de afirmar.
    await waitFor(() => expect(container.querySelector('.barra-offline')).toBeNull());
  });

  it('con cola pendiente monta la franja: el selector :has() de .contenido se dispara', async () => {
    mockEstado.pendientes = 3;
    mockEstado.alcanzable = true;
    mockDatos.dias = 0;
    mockDatos.estudiantes = 10;
    render(<BarraOffline />);
    expect(await screen.findByRole('status')).toHaveClass('barra-offline');
  });

  it('sin alcance al servidor tambien monta la franja aunque no haya pendientes', async () => {
    mockEstado.pendientes = 0;
    mockEstado.alcanzable = false;
    mockDatos.dias = 0;
    mockDatos.estudiantes = 10;
    render(<BarraOffline />);
    expect(await screen.findByRole('status')).toHaveClass('barra-offline', 'sin-red');
  });

  it('sin datos descargados monta la franja aunque todo este sincronizado y alcanzable', async () => {
    mockEstado.pendientes = 0;
    mockEstado.alcanzable = true;
    mockDatos.dias = null as unknown as number;
    mockDatos.estudiantes = 0;
    render(<BarraOffline />);
    expect(await screen.findByText(/No hay datos descargados/)).toBeTruthy();
  });

  it('con datos de mas de una semana avisa aunque todo este sincronizado', async () => {
    mockEstado.pendientes = 0;
    mockEstado.alcanzable = true;
    mockDatos.dias = 7;
    mockDatos.estudiantes = 10;
    render(<BarraOffline />);
    expect(await screen.findByText(/se descargaron hace 7 dias/)).toBeTruthy();
  });

  it('tras una descarga exitosa sin marcar nada, deja de decir que no hay datos al recuperar visibilidad', async () => {
    // pendientes y alcanzable no cambian (la cola sigue vacia): el unico disparador
    // honesto disponible aqui es el evento de visibilidad, igual que en produccion.
    mockEstado.pendientes = 0;
    mockEstado.alcanzable = true;
    mockDatos.dias = null as unknown as number;
    mockDatos.estudiantes = 0;
    render(<BarraOffline />);
    expect(await screen.findByText(/No hay datos descargados/)).toBeTruthy();

    // downloadBootstrap tuvo exito en Menu.tsx: ya hay estudiantes.
    mockDatos.dias = 0;
    mockDatos.estudiantes = 10;
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });
});
