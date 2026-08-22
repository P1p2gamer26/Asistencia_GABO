import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Menu from './Menu';

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
    expect(screen.queryByRole('link', { name: /asistencia a clase/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /administracion/i })).not.toBeInTheDocument();
  });

  it('ofrece cerrar sesion', async () => {
    sesion('DOCENTE');
    pintar();
    expect(screen.getByRole('button', { name: /cerrar sesion/i })).toBeInTheDocument();
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
