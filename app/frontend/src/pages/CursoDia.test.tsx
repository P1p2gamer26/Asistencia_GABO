import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CursoDia from './CursoDia';

// La respuesta sigue la fecha que pide la pantalla, asi la prueba no depende del dia de hoy.
function semanaPara(url: string) {
  const fecha = new URL(url, 'http://x').searchParams.get('from')!;
  return {
    estudiantes: [{ id: 5, documentId: '1', fullName: 'Luis Ruiz' }],
    dias: [{ fecha, cicloDia: 1, descripcion: null, bloques: [
      { blockNo: 1, subject: 'Matematicas', teacherName: 'Marta Restrepo' },
      { blockNo: 2, subject: 'Ingles', teacherName: 'Jorge Gutierrez' },
    ] }],
    marcas: [
      { classDate: fecha, blockNo: 1, studentId: 5, status: 'P', comment: null },
      { classDate: fecha, blockNo: 2, studentId: 5, status: 'F', comment: 'no llego' },
    ],
  };
}

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const pintar = () => render(
  <MemoryRouter initialEntries={['/curso/601']}>
    <Routes><Route path="/curso/:grade" element={<CursoDia />} /></Routes>
  </MemoryRouter>);

describe('CursoDia', () => {
  it('muestra los estudiantes del curso con su marca en cada bloque del dia', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respuesta(semanaPara(String(url)))));
    pintar();
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('Luis Ruiz')).toBeInTheDocument();
    expect(within(tabla).getByText('Matematicas')).toBeInTheDocument();
    expect(within(tabla).getByText('Ingles')).toBeInTheDocument();
    expect(within(tabla).getByText('P')).toBeInTheDocument();
    expect(within(tabla).getByText('F').closest('td')).toHaveAttribute('title', 'no llego');
  });

  it('el dia anterior pide la fecha anterior al dia que se ve', async () => {
    const fetchMock = vi.fn(async (url: string) => respuesta(semanaPara(String(url))));
    vi.stubGlobal('fetch', fetchMock);
    pintar();
    await screen.findByRole('table');
    const primera = new URL(String(fetchMock.mock.calls[0][0]), 'http://x').searchParams.get('from')!;
    fireEvent.click(screen.getByRole('button', { name: /dia anterior/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const segunda = new URL(String(fetchMock.mock.calls[1][0]), 'http://x').searchParams.get('from')!;
    expect(segunda < primera).toBe(true);
    expect(String(fetchMock.mock.calls[1][0])).toContain('grade=601');
  });

  it('un dia sin clases lo dice en vez de mostrar una tabla vacia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ estudiantes: [], dias: [], marcas: [] })));
    pintar();
    await waitFor(() => expect(screen.getByText(/sin clases este dia/i)).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
