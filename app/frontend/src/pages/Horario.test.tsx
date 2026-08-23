import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Horario from './Horario';

const SEMANA = [
  { id: 11, grade: '601', weekday: 1, blockNo: 1, subject: 'Ciencias',
    startTime: '06:30', endTime: '07:20', room: 'Aula 201', teacherName: 'Pepito Perez' },
  { id: 12, grade: '602', weekday: 3, blockNo: 4, subject: 'Matematicas',
    startTime: '09:15', endTime: '10:05', room: 'Laboratorio 1', teacherName: 'Pepito Perez' },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function pintar() {
  return render(
    <MemoryRouter initialEntries={['/horario']}>
      <Routes>
        <Route path="/horario" element={<Horario />} />
        <Route path="/asistencia" element={<p>pantalla de asistencia</p>} />
      </Routes>
    </MemoryRouter>);
}

describe('Horario', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'DOCENTE',
      fullName: 'Pepito Perez', userId: 3, mustChangePassword: false,
    }));
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(SEMANA)));
  });

  it('muestra curso, materia y aula de cada bloque', async () => {
    pintar();
    await waitFor(() => expect(screen.getByText(/Ciencias/)).toBeInTheDocument());
    expect(screen.getByText(/601/)).toBeInTheDocument();
    // "Donde tengo clase" es la pregunta que motivo esta pantalla.
    expect(screen.getByText(/Aula 201/)).toBeInTheDocument();
    expect(screen.getByText(/Laboratorio 1/)).toBeInTheDocument();
  });

  it('coloca cada bloque en su dia', async () => {
    pintar();
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());
    expect(screen.getByLabelText(/lunes.*bloque 1.*Ciencias/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/miercoles.*bloque 4.*Matematicas/i)).toBeInTheDocument();
  });

  it('desde un bloque se entra a tomar la lista de ese curso', async () => {
    pintar();
    await waitFor(() => expect(screen.getByText(/Ciencias/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('link', { name: /tomar la lista de 601/i }));
    expect(await screen.findByText('pantalla de asistencia')).toBeInTheDocument();
  });

  it('un horario vacio lo dice, en vez de mostrar una rejilla en blanco', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([])));
    pintar();
    await waitFor(() =>
      expect(screen.getByText(/no tiene bloques asignados/i)).toBeInTheDocument());
  });

  it('sin conexion lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    pintar();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar/i));
  });
});

const SEMANA_SALON = [
  { id: 21, grade: '603', weekday: 1, blockNo: 2, subject: 'Informatica',
    startTime: '07:25', endTime: '08:15', room: 'Aula 203', teacherName: 'Ana Rojas' },
];

function pintarComo(role: string) {
  localStorage.setItem('ggm.session', JSON.stringify({
    token: 't', refreshToken: 'r', role, fullName: 'Coord Persona', userId: 9,
    mustChangePassword: false,
  }));
  return render(
    <MemoryRouter initialEntries={['/horario']}>
      <Routes><Route path="/horario" element={<Horario />} /></Routes>
    </MemoryRouter>);
}

describe('Horario: salones', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/schedule/rooms')) {
        return respuesta({ rooms: ['Aula 203', 'Laboratorio 1'], withoutRoom: 3 });
      }
      if (url.includes('room=')) return respuesta(SEMANA_SALON);
      return respuesta(SEMANA);
    }));
  });

  it('coordinacion ve la lista de salones y cuantos bloques no tienen aula', async () => {
    pintarComo('COORDINADOR');
    expect(await screen.findByRole('button', { name: 'Aula 203' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Laboratorio 1' })).toBeInTheDocument();
    expect(screen.getByText(/3 bloques sin aula asignada/i)).toBeInTheDocument();
  });

  it('un docente no ve la lista de salones', async () => {
    pintarComo('DOCENTE');
    await waitFor(() => expect(screen.getByText(/Ciencias/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Aula 203' })).not.toBeInTheDocument();
  });

  it('al elegir un salon se ve que clases se dictan alli, de que curso y con que docente', async () => {
    pintarComo('COORDINADOR');
    await userEvent.click(await screen.findByRole('button', { name: 'Aula 203' }));
    expect(await screen.findByText(/Horario del salon Aula 203/i)).toBeInTheDocument();
    expect(screen.getByText('603')).toBeInTheDocument();
    expect(screen.getByText('Informatica')).toBeInTheDocument();
    expect(screen.getByText('Ana Rojas')).toBeInTheDocument();
  });
});
