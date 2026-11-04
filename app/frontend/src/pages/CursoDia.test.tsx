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
      { blockNo: 1, subject: 'Matematicas', teacherName: 'Marta Restrepo', startTime: '07:00:00', endTime: '07:50:00' },
      { blockNo: 2, subject: 'Ingles', teacherName: 'Jorge Gutierrez', startTime: '07:50:00', endTime: '08:40:00' },
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
    // La tabla de estudiantes por bloque es la ultima.
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

  it('los comentarios del dia aparecen con su bloque, la hora y el estudiante', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respuesta(semanaPara(String(url)))));
    pintar();
    await screen.findByRole('heading', { name: 'Comentarios del dia' });
    expect(screen.getByText('Bloque 2')).toBeInTheDocument();
    expect(screen.getByText(/07:50 – 08:40/)).toBeInTheDocument();
    expect(screen.getByText('Luis Ruiz:')).toBeInTheDocument();
    expect(screen.getByText('no llego')).toBeInTheDocument();
    // El bloque sin comentario no aparece en la lista.
    expect(screen.queryByText('Bloque 1')).not.toBeInTheDocument();
  });

  it('sin comentarios lo dice', async () => {
    const sinComentarios = (url: string) => {
      const d = semanaPara(url);
      return { ...d, marcas: d.marcas.map((m) => ({ ...m, comment: null })) };
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respuesta(sinComentarios(String(url)))));
    pintar();
    await screen.findByRole('heading', { name: 'Comentarios del dia' });
    expect(screen.getByText('Sin comentarios hoy en este curso.')).toBeInTheDocument();
  });

  it('el dia 0 muestra sus bloques para tomar lista, igual que un dia normal', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respuesta({
      ...semanaPara(String(url)),
      dias: [{ fecha: new URL(String(url), 'http://x').searchParams.get('from'), cicloDia: null,
        descripcion: null, tipo: 'DIA_CERO', bloques: [{ blockNo: 1, subject: 'Matematicas', teacherName: 'Ana' }] }],
      marcas: [],
    })));
    pintar();
    expect(await screen.findByRole('heading', { name: 'Estudiantes por bloque' })).toBeInTheDocument();
    expect(screen.queryByText('Asistencia general del dia')).not.toBeInTheDocument();
  });

  it('un dia sin clases lo dice en vez de mostrar una tabla vacia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ estudiantes: [], dias: [], marcas: [] })));
    pintar();
    await waitFor(() => expect(screen.getByText(/sin clases este dia/i)).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
