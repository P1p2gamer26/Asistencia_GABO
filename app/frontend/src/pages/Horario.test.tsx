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

const DOCENTES = [
  { id: 5, email: 'pepito@co', fullName: 'Pepito Perez', role: 'DOCENTE', active: true },
  { id: 6, email: 'laura@co', fullName: 'Laura Ruiz', role: 'DOCENTE', active: true },
];

describe('Horario: navegacion por curso', () => {
  beforeEach(() => {
    // El selector de docente pide /api/admin/users y la semana pide /api/schedule/week.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const ruta = String(url);
      return ruta.includes('/api/admin/users')
        ? respuesta(DOCENTES)
        : respuesta(SEMANA);
    }));
  });

  // El horario se piensa por curso: la navegacion por salon se quito porque cada
  // curso tiene su aula fija y era la misma lista dos veces.
  it('nadie ve una lista de salones', async () => {
    pintarComo('COORDINADOR');
    await waitFor(() => expect(screen.getByText(/Ciencias/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Aula/i })).not.toBeInTheDocument();
  });

  it('coordinacion puede pedir el horario de otro curso', async () => {
    pintarComo('COORDINADOR');
    await userEvent.type(await screen.findByLabelText(/horario de un curso/i), '6A');
    expect(await screen.findByText(/Horario del curso 6A/i)).toBeInTheDocument();
  });

  it('coordinacion puede pedir el horario de un docente por el selector', async () => {
    pintarComo('COORDINADOR');
    await waitFor(() =>
      expect(screen.getByLabelText(/horario de un docente/i)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/horario de un docente/i), '5');
    expect(await screen.findByText(/Horario de Pepito Perez/i)).toBeInTheDocument();
    // La peticion a la semana debe ir filtrada por ese docente y no por curso.
    await waitFor(() => expect(screen.getByLabelText(/lunes.*bloque 1.*Ciencias/i)).toBeInTheDocument());
  });

  it('un docente no ve el selector ni la lista de docentes', async () => {
    pintarComo('DOCENTE');
    await waitFor(() => expect(screen.getByText(/Ciencias/)).toBeInTheDocument());
    expect(screen.queryByLabelText(/horario de un docente/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/horario de un curso/i)).not.toBeInTheDocument();
  });
});
