import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// La franja esta SIEMPRE montada: el docente tiene que poder ver en que modo trabaja
// sin tener que deducirlo de que no aparezca nada. Lo que cambia con el estado es el
// mensaje y la clase de modo, y eso es lo que se verifica aqui. jsdom no calcula
// layout, asi que el padding que reserva .contenido con :has() no se afirma desde una
// prueba: solo la presencia del elemento que dispara ese selector.
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
  it('con todo sincronizado dice que esta en linea y que no queda nada por subir', async () => {
    mockEstado.pendientes = 0;
    mockEstado.alcanzable = true;
    mockDatos.dias = 0;
    mockDatos.estudiantes = 10;
    render(<BarraOffline />);
    const franja = await screen.findByRole('status');
    await waitFor(() => expect(franja).toHaveClass('en-linea'));
    expect(franja).toHaveTextContent(/En linea · todo subido/);
    // En el caso normal no se ofrece reintentar: no hay nada que reintentar.
    expect(screen.queryByRole('button', { name: /reintentar/i })).toBeNull();
  });

  it('sin internet lo dice y aclara que se puede seguir tomando lista', async () => {
    mockEstado.pendientes = 0;
    mockEstado.alcanzable = false;
    mockDatos.dias = 0;
    mockDatos.estudiantes = 10;
    render(<BarraOffline />);
    const franja = await screen.findByRole('status');
    expect(franja).toHaveClass('sin-red');
    expect(franja).toHaveTextContent(/Sin internet/);
    expect(franja).toHaveTextContent(/se guarda en este dispositivo/);
  });

  it('sin internet y con marcas pendientes promete que suben solas al reconectar', async () => {
    mockEstado.pendientes = 4;
    mockEstado.alcanzable = false;
    mockDatos.dias = 0;
    mockDatos.estudiantes = 10;
    render(<BarraOffline />);
    const franja = await screen.findByRole('status');
    expect(franja).toHaveTextContent(/4 marcas guardadas aqui/);
    expect(franja).toHaveTextContent(/suben solas al reconectar/);
  });

  it('con cola pendiente monta la franja: el selector :has() de .contenido se dispara', async () => {
    mockEstado.pendientes = 3;
    mockEstado.alcanzable = true;
    mockDatos.dias = 0;
    mockDatos.estudiantes = 10;
    render(<BarraOffline />);
    const franja = await screen.findByRole('status');
    expect(franja).toHaveClass('barra-offline', 'subiendo');
    expect(franja).toHaveTextContent(/subiendo 3 marcas/);
  });

  it('sin datos descargados monta la franja aunque todo este sincronizado y alcanzable', async () => {
    mockEstado.pendientes = 0;
    mockEstado.alcanzable = true;
    mockDatos.dias = null as unknown as number;
    mockDatos.estudiantes = 0;
    render(<BarraOffline />);
    expect(await screen.findByText(/faltan los datos del colegio/)).toBeTruthy();
  });

  it('con datos de mas de una semana avisa aunque todo este sincronizado', async () => {
    mockEstado.pendientes = 0;
    mockEstado.alcanzable = true;
    mockDatos.dias = 7;
    mockDatos.estudiantes = 10;
    render(<BarraOffline />);
    expect(await screen.findByText(/son de hace 7 dias/)).toBeTruthy();
  });

  it('tras una descarga exitosa sin marcar nada, deja de decir que no hay datos al recuperar visibilidad', async () => {
    // pendientes y alcanzable no cambian (la cola sigue vacia): el unico disparador
    // honesto disponible aqui es el evento de visibilidad, igual que en produccion.
    mockEstado.pendientes = 0;
    mockEstado.alcanzable = true;
    mockDatos.dias = null as unknown as number;
    mockDatos.estudiantes = 0;
    render(<BarraOffline />);
    expect(await screen.findByText(/faltan los datos del colegio/)).toBeTruthy();

    // downloadBootstrap tuvo exito en Menu.tsx: ya hay estudiantes.
    mockDatos.dias = 0;
    mockDatos.estudiantes = 10;
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/En linea · todo subido/));
  });
});
