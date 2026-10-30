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
    // Hay dos tablas: el resumen de bloques y la de estudiantes (la ultima).
    const tablas = await screen.findAllByRole('table');
    const tabla = tablas[tablas.length - 1];
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
    await screen.findAllByRole('table');
    const primera = new URL(String(fetchMock.mock.calls[0][0]), 'http://x').searchParams.get('from')!;
    fireEvent.click(screen.getByRole('button', { name: /dia anterior/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const segunda = new URL(String(fetchMock.mock.calls[1][0]), 'http://x').searchParams.get('from')!;
    expect(segunda < primera).toBe(true);
    expect(String(fetchMock.mock.calls[1][0])).toContain('grade=601');
  });

  it('el resumen de bloques dice cuales ya se tomaron', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respuesta(semanaPara(String(url)))));
    pintar();
    await screen.findByRole('heading', { name: 'Bloques del dia' });
    // El estudiante tiene marca en los dos bloques: ambos quedan tomados.
    expect(screen.getAllByText('Tomada').length).toBe(2);
  });

  it('en el dia 0 otro clic en P quita la marca', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/dia-cero') && init?.method === 'PUT') return respuesta({ guardadas: 0 });
      if (String(url).includes('/api/dia-cero')) return respuesta([]);
      return respuesta({ ...semanaPara(String(url)), dias: [{ fecha: new URL(String(url), 'http://x').searchParams.get('from'), cicloDia: null, descripcion: null, bloques: [], tipo: 'DIA_CERO' }], marcas: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    pintar();
    const pBoton = await screen.findByRole('button', { name: 'Luis Ruiz: Presente' });
    fireEvent.click(pBoton);
    expect(pBoton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(pBoton);
    expect(pBoton).toHaveAttribute('aria-pressed', 'false');
  });

  it('un dia sin clases lo dice en vez de mostrar una tabla vacia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ estudiantes: [], dias: [], marcas: [] })));
    pintar();
    await waitFor(() => expect(screen.getByText(/sin clases este dia/i)).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
