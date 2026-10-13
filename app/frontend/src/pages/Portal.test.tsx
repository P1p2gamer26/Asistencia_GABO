import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Portal from './Portal';

it('lleva al login desde la portada', () => {
  render(<MemoryRouter><Portal /></MemoryRouter>);
  expect(screen.getByRole("link", { name: /Ingresar al sistema/ })).toHaveAttribute('href', '/login');
});

it('sin sesion solo se ve el video del colegio, no los tutoriales', () => {
  render(<MemoryRouter><Portal /></MemoryRouter>);
  expect(screen.getByText('Conozca el colegio')).toBeInTheDocument();
  expect(screen.queryByText('Tutorial para docentes')).not.toBeInTheDocument();
  expect(screen.queryByText('Coordinación: cargar los datos')).not.toBeInTheDocument();
});
