import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Menu from './Menu';
import { db } from '../db/local';
import * as syncEngine from '../sync/engine';

function sesion(role: string) {
  localStorage.setItem('ggm.session', JSON.stringify({
    token: 't', refreshToken: 'r', role, fullName: 'Quien Sea',
    userId: 1, mustChangePassword: false,
  }));
}

const pintar = () => render(<MemoryRouter><Menu /></MemoryRouter>);

describe('Menu', () => {
  beforeEach(() => localStorage.clear());

  it('un docente ve lo suyo y no lo de administracion', () => {
    sesion('DOCENTE');
    pintar();
    expect(screen.getByRole('link', { name: /asistencia/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /horario/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /calendario/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /administracion/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tablero/i })).not.toBeInTheDocument();
  });

  it('coordinacion ve el tablero pero no administracion', () => {
    sesion('COORDINADOR');
    pintar();
    expect(screen.getByRole('link', { name: /tablero/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /administracion/i })).not.toBeInTheDocument();
  });

  it('el administrador lo ve todo', () => {
    sesion('ADMIN');
    pintar();
    expect(screen.getByRole('link', { name: /administracion/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tablero/i })).toBeInTheDocument();
  });

  it('un acudiente solo ve lo suyo', () => {
    sesion('ACUDIENTE');
    pintar();
    expect(screen.getByRole('link', { name: /mis hijos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /calendario/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /asistencia a clase/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^ingreso/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /consultas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tablero/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /administracion/i })).not.toBeInTheDocument();
  });

  it('ofrece cerrar sesion', async () => {
    sesion('DOCENTE');
    pintar();
    expect(screen.getByRole('button', { name: /cerrar sesion/i })).toBeInTheDocument();
  });

  it('un docente ve el control de actualizar datos', () => {
    sesion('DOCENTE');
    pintar();
    expect(screen.getByRole('button', { name: /actualizar datos/i })).toBeInTheDocument();
  });

  it('el administrador tambien ve el control de actualizar datos', () => {
    sesion('ADMIN');
    pintar();
    expect(screen.getByRole('button', { name: /actualizar datos/i })).toBeInTheDocument();
  });

  it('al actualizar sincroniza y luego muestra la fecha de la ultima descarga', async () => {
    sesion('DOCENTE');
    await db.meta.clear();
    vi.spyOn(syncEngine, 'downloadBootstrap').mockResolvedValue();
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /actualizar datos/i }));
    expect(syncEngine.downloadBootstrap).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/datos descargados/i)).toBeInTheDocument());
    expect(screen.getByText(/datos descargados/i).textContent).not.toMatch(/nunca/i);
  });

  it('en pantalla estrecha el menu se abre y se cierra', async () => {
    sesion('DOCENTE');
    pintar();
    const abrir = screen.getByRole('button', { name: /abrir menu/i });
    await userEvent.click(abrir);
    expect(screen.getByRole('navigation')).toHaveAttribute('data-abierto', 'true');
    await userEvent.click(screen.getByRole('button', { name: /cerrar menu/i }));
    expect(screen.getByRole('navigation')).toHaveAttribute('data-abierto', 'false');
  });
});
