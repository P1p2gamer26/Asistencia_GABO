import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Home from './Home';
import { api } from '../api/client';

function sesion(role = 'DOCENTE') {
  localStorage.setItem('ggm.session', JSON.stringify({
    token: 't', refreshToken: 'r', role, fullName: 'Ana Docente', userId: 1,
  }));
}

const pintar = () => render(<MemoryRouter><Home /></MemoryRouter>);

describe('Home: pendientes de hoy', () => {
  it('lista los bloques sin asistencia y enlaza con el curso ya elegido', async () => {
    sesion();
    vi.spyOn(api, 'get').mockResolvedValue([
      { blockId: 7, grade: '103', subject: 'Matematicas', blockNo: 2 },
    ]);
    pintar();
    const enlace = await screen.findByRole('link', { name: /Bloque 2/ });
    expect(enlace).toHaveTextContent('103');
    expect(enlace).toHaveTextContent('Matematicas');
    expect(enlace.getAttribute('href')).toBe('/asistencia?grade=103&blockId=7');
  });

  it('sin pendientes no muestra el aviso', async () => {
    sesion();
    vi.spyOn(api, 'get').mockResolvedValue([]);
    pintar();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText(/Falta tomar asistencia/)).toBeNull();
  });

  it('sin conexion la pantalla sigue usable', async () => {
    sesion();
    vi.spyOn(api, 'get').mockRejectedValue(new Error('Sin conexion'));
    pintar();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.getByText(/Bienvenido/)).toBeInTheDocument();
  });
});
