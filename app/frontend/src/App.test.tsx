import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

/**
 * El backend ya rechaza al acudiente en /api, pero la interfaz tampoco debe
 * dejarle abrir pantallas de docente escribiendo la URL: sin esto, el acudiente
 * ve la lista de estudiantes de un curso completo antes de que falle la peticion.
 */
function sesion(role: string) {
  localStorage.setItem('ggm.session', JSON.stringify({
    token: 't', refreshToken: 'r', role, fullName: 'Ana Perez', userId: 9,
  }));
}

function abrir(ruta: string) {
  return render(<MemoryRouter initialEntries={[ruta]}><App /></MemoryRouter>);
}

describe('rutas por rol', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin red'))));
  });

  it('manda al login sin sesion', () => {
    abrir('/asistencia');
    expect(screen.getByLabelText('Correo institucional')).toBeInTheDocument();
  });

  it('el acudiente no entra a tomar asistencia: cae en su portal', async () => {
    sesion('ACUDIENTE');
    abrir('/asistencia');
    await waitFor(() => expect(screen.getByText(/Asistencia de mis hijos/i)).toBeInTheDocument());
  });

  it('el acudiente no entra al ingreso por carnet', async () => {
    sesion('ACUDIENTE');
    abrir('/ingreso');
    await waitFor(() => expect(screen.getByText(/Asistencia de mis hijos/i)).toBeInTheDocument());
  });

  it('el docente si entra a tomar asistencia', async () => {
    sesion('DOCENTE');
    abrir('/asistencia');
    await waitFor(() => expect(screen.queryByText(/Asistencia de mis hijos/i)).not.toBeInTheDocument());
  });
});
