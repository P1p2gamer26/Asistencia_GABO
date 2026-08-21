import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PanelCarga from './PanelCarga';

function csv(nombre = 'estudiantes.csv') {
  return new File(['document_id,first_name\n123,ANA\n'], nombre, { type: 'text/csv' });
}

describe('PanelCarga', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ADMIN', fullName: 'Admin', userId: 1,
    }));
  });

  it('muestra las tres cargas con su cabecera esperada', () => {
    render(<PanelCarga />);
    expect(screen.getByText(/Estudiantes/)).toBeInTheDocument();
    expect(screen.getByText(/Horario/)).toBeInTheDocument();
    expect(screen.getByText(/Acudientes/)).toBeInTheDocument();
    expect(screen.getByText(/document_id,first_name/)).toBeInTheDocument();
  });

  it('informa cuantas filas se cargaron', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ imported: 1200, errors: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));

    render(<PanelCarga />);
    await userEvent.upload(screen.getByLabelText(/archivo csv de estudiantes/i), csv());
    await waitFor(() => expect(screen.getByText(/1200 fila/i)).toBeInTheDocument());
  });

  it('muestra el detalle de las lineas con error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ imported: 2, errors: ['Linea 5: faltan columnas', 'Linea 9: documento vacio'] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));

    render(<PanelCarga />);
    await userEvent.upload(screen.getByLabelText(/archivo csv de estudiantes/i), csv());
    // "0 filas cargadas" sin decir por que es inservible con 1200 estudiantes.
    await waitFor(() => expect(screen.getByText(/Linea 5: faltan columnas/)).toBeInTheDocument());
    expect(screen.getByText(/Linea 9: documento vacio/)).toBeInTheDocument();
  });

  it('si el servidor rechaza el archivo lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    render(<PanelCarga />);
    await userEvent.upload(screen.getByLabelText(/archivo csv de estudiantes/i), csv());
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i));
  });
});
