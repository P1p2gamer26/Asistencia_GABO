import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InicioDocente from './InicioDocente';

const DIA = {
  lectivo: true, fecha: '2026-08-03', motivo: null,
  bloques: [
    { id: 11, blockNo: 1, grade: '601', subject: 'Ciencias', room: 'Laboratorio 1',
      startTime: '07:00', endTime: '07:50', marcados: 38, estudiantes: 38 },
    { id: 12, blockNo: 3, grade: '702', subject: 'Ciencias', room: 'Aula 204',
      startTime: '09:00', endTime: '09:50', marcados: 0, estudiantes: 35 },
    { id: 13, blockNo: 5, grade: '801', subject: 'Ciencias', room: 'Aula 305',
      startTime: '11:00', endTime: '11:50', marcados: 3, estudiantes: 40 },
  ],
};

const SIN_PENDIENTES = { grupos: [], totalGrupos: 0 };

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/** Enruta por URL: /my-day y /pending-recent responden cosas distintas. */
function mockFetch(dia: unknown, pendientes: unknown) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('/pending-recent')) return respuesta(pendientes);
    return respuesta(dia);
  });
}

const pintar = () => render(<MemoryRouter><InicioDocente /></MemoryRouter>);

describe('InicioDocente', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'DOCENTE',
      fullName: 'Pepito Perez', userId: 3, mustChangePassword: false,
    }));
    vi.stubGlobal('fetch', mockFetch(DIA, SIN_PENDIENTES));
  });

  it('dice en que aula es cada clase', async () => {
    pintar();
    await waitFor(() => expect(screen.getByText(/Laboratorio 1/)).toBeInTheDocument());
    expect(screen.getByText(/Aula 204/)).toBeInTheDocument();
    expect(screen.getByText(/Aula 305/)).toBeInTheDocument();
  });

  it('distingue lo tomado, lo que va a medias y lo que falta', async () => {
    pintar();
    // Un si/no diria que el bloque de 3 de 40 ya esta tomado. No lo esta.
    await waitFor(() => expect(screen.getByText(/38 de 38/)).toBeInTheDocument());
    expect(screen.getByText(/3 de 40/)).toBeInTheDocument();
    expect(screen.getByText(/sin tomar/i)).toBeInTheDocument();
  });

  it('el bloque a medias tambien ofrece terminarlo, no solo el vacio', async () => {
    pintar();
    // 3 de 40 es el caso peligroso: parece hecho y no lo esta.
    const enlaces = await screen.findAllByRole('link', { name: /tomar la lista/i });
    const destinos = enlaces.map((e) => e.getAttribute('href'));
    expect(destinos).toContain('/asistencia?bloque=12');
    expect(destinos).toContain('/asistencia?bloque=13');
    expect(destinos).not.toContain('/asistencia?bloque=11');
  });

  it('en dia no lectivo lo dice y no inventa bloques', async () => {
    vi.stubGlobal('fetch', mockFetch(
      { lectivo: false, fecha: '2026-08-07', motivo: 'Batalla de Boyaca', bloques: [] },
      SIN_PENDIENTES));
    pintar();
    // No se pintan ceros: no hay clase, y eso es lo que se dice.
    await waitFor(() => expect(screen.getByText(/no hay clase/i)).toBeInTheDocument());
    expect(screen.getByText(/Batalla de Boyaca/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tomar la lista/i })).not.toBeInTheDocument();
  });

  it('un docente sin bloques lo lee, no se queda con una pantalla muda', async () => {
    vi.stubGlobal('fetch', mockFetch(
      { lectivo: true, fecha: '2026-08-03', motivo: null, bloques: [] }, SIN_PENDIENTES));
    pintar();
    await waitFor(() =>
      expect(screen.getByText(/no tiene clases asignadas hoy/i)).toBeInTheDocument());
  });

  it('sin conexion lo dice en vez de fingir un dia sin clases', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));
    pintar();
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
  });

  it('en dia no lectivo, "Listas pendientes" sigue mostrandose', async () => {
    vi.stubGlobal('fetch', mockFetch(
      { lectivo: false, fecha: '2026-08-08', motivo: 'Domingo', bloques: [] }, SIN_PENDIENTES));
    pintar();
    await waitFor(() => expect(screen.getByText(/no hay clase/i)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /listas pendientes/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/no tiene listas pendientes/i)).toBeInTheDocument());
  });

  it('muestra los pendientes agrupados por dia y curso, con enlace para tomarlos', async () => {
    const PENDIENTES = {
      grupos: [
        { fecha: '2026-08-06', grade: '601', listas: 6 },
        { fecha: '2026-08-04', grade: '702', listas: 1 },
      ],
      totalGrupos: 2,
    };
    vi.stubGlobal('fetch', mockFetch(DIA, PENDIENTES));
    pintar();
    await waitFor(() => expect(screen.getByText('2026-08-06')).toBeInTheDocument());
    expect(screen.getByText('2026-08-04')).toBeInTheDocument();
    // Una sola fila por dia+curso, no una por bloque: 6 listas sin tomar es UN
    // renglon, no seis.
    expect(screen.getByText(/6 listas sin tomar/i)).toBeInTheDocument();
    const enlace = screen.getByRole('link', { name: /tomar la lista de 601/i });
    expect(enlace.getAttribute('href')).toBe('/asistencia?grade=601&fecha=2026-08-06');
  });

  it('si hay mas grupos de los que se muestran, lo dice en vez de recortar en silencio', async () => {
    const PENDIENTES = {
      grupos: [{ fecha: '2026-08-06', grade: '601', listas: 6 }],
      totalGrupos: 8,
    };
    vi.stubGlobal('fetch', mockFetch(DIA, PENDIENTES));
    pintar();
    await waitFor(() => expect(screen.getByText(/y 7 mas/i)).toBeInTheDocument());
  });

  it('un curso con muchisimos pendientes no le tapa la fila a otro con pocos', async () => {
    // El reparto real vive en el backend (PendientesRecientesTest); aqui solo se
    // comprueba que el frontend pinta lo que el backend ya reparto de forma justa,
    // no que oculte nada de lo que llega.
    const PENDIENTES = {
      grupos: [
        { fecha: '2026-08-06', grade: '607', listas: 6 },
        { fecha: '2026-08-05', grade: '607', listas: 6 },
        { fecha: '2026-08-04', grade: '601', listas: 1 },
      ],
      totalGrupos: 9,
    };
    vi.stubGlobal('fetch', mockFetch(DIA, PENDIENTES));
    pintar();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /tomar la lista de 601/i })).toBeInTheDocument());
  });

  it('si no puede consultar las pendientes lo dice, no muestra cero', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/pending-recent')) throw new Error('sin red');
      return respuesta(DIA);
    }));
    pintar();
    await waitFor(() =>
      expect(screen.getByText(/no se pudieron consultar las listas pendientes/i))
        .toBeInTheDocument());
    expect(screen.queryByText(/no tiene listas pendientes/i)).not.toBeInTheDocument();
  });
});
