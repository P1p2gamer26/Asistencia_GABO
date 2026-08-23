import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InicioAdmin from './InicioAdmin';

const HOY = {
  lectivo: true, fecha: '2026-08-24',
  bloquesEsperados: 36, bloquesMarcados: 12,
  presentes: 320, tarde: 14, ausentes: 22, evasiones: 4,
  ingresos: 380, mesAsistencia: 94.6, mesDiasLectivos: 16,
};

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const pintar = () => render(<MemoryRouter><InicioAdmin /></MemoryRouter>);

describe('InicioAdmin', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ADMIN',
      fullName: 'Administrador', userId: 1, mustChangePassword: false,
    }));
  });

  it('lo primero que muestra es cuanto del colegio ha reportado hoy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HOY)));
    pintar();
    // Un 100 % de asistencia sobre 3 bloques de 36 no es buena noticia: por eso la
    // cobertura va antes que el porcentaje.
    await waitFor(() => expect(screen.getByText(/12 de 36/)).toBeInTheDocument());
  });

  it('muestra los estados de hoy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HOY)));
    pintar();
    await waitFor(() => expect(screen.getByText('22')).toBeInTheDocument());
    expect(screen.getByText(/ausentes hoy/i)).toBeInTheDocument();
  });

  it('muestra el mes como contexto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HOY)));
    pintar();
    await waitFor(() => expect(screen.getByText(/94.6/)).toBeInTheDocument());
    expect(screen.getByText(/16 dias lectivos/i)).toBeInTheDocument();
  });

  it('un dia no lectivo lo dice en vez de alarmar con ceros', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({
      ...HOY, lectivo: false, bloquesEsperados: 0, bloquesMarcados: 0,
      presentes: 0, tarde: 0, ausentes: 0, evasiones: 0, ingresos: 0,
    })));
    pintar();
    await waitFor(() => expect(screen.getByText(/hoy no hay clase/i)).toBeInTheDocument());
    expect(screen.queryByText(/0 de 0/)).not.toBeInTheDocument();
  });

  it('sin conexion lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    pintar();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i));
  });
});
