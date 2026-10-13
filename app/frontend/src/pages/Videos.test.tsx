import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Videos from './Videos';

function sesion(role: string) {
  localStorage.setItem('ggm.session', JSON.stringify({
    token: 't', refreshToken: 'r', role, fullName: 'Quien Sea', userId: 1, mustChangePassword: false,
  }));
}

describe('Videos', () => {
  beforeEach(() => localStorage.clear());

  it('un docente ve el suyo y no el de carga de datos', () => {
    sesion('DOCENTE');
    render(<Videos />);
    expect(screen.getByText('Tutorial para docentes')).toBeInTheDocument();
    expect(screen.queryByText('Coordinación: cargar los datos')).not.toBeInTheDocument();
  });

  it('un acudiente solo ve el de familias', () => {
    sesion('ACUDIENTE');
    render(<Videos />);
    expect(screen.getByText('Tutorial para familias')).toBeInTheDocument();
    expect(screen.queryByText('Tutorial para docentes')).not.toBeInTheDocument();
  });
});
