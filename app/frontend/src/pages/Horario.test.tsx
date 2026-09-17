import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Horario from './Horario';
import { db } from '../db/local';

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
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
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
    expect(screen.getByLabelText(/dia 1.*bloque 1.*Ciencias/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dia 3.*bloque 4.*Matematicas/i)).toBeInTheDocument();
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

describe('Horario: navegacion por salon y por docente', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    // El selector pregunta por salon (/api/schedule/grades) y por docente
    // (/api/admin/users); la semana pide /api/schedule/week.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const ruta = String(url);
      if (ruta.includes('/api/schedule/grades')) return respuesta(['6A', '601', '602']);
      if (ruta.includes('/api/admin/users')) return respuesta(DOCENTES);
      return respuesta(SEMANA);
    }));
  });

  it('pedir el horario por salon muestra el desplegable con los cursos', async () => {
    pintarComo('COORDINADOR');
    await waitFor(() => expect(screen.getByText(/Ciencias/)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/ver el horario de/i), 'salon');
    const salon = screen.getByLabelText(/salon/i);
    expect(salon).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '6A' })).toBeInTheDocument();
  });

  it('coordinacion puede pedir el horario de otro curso desde el desplegable', async () => {
    pintarComo('COORDINADOR');
    await userEvent.selectOptions(await screen.findByLabelText(/ver el horario de/i), 'salon');
    await userEvent.selectOptions(await screen.findByLabelText(/salon/i), '6A');
    expect(await screen.findByText(/Horario del curso 6A/i)).toBeInTheDocument();
  });

  it('coordinacion puede pedir el horario de un docente por el selector', async () => {
    pintarComo('COORDINADOR');
    await waitFor(() =>
      expect(screen.getByLabelText(/ver el horario de/i)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/ver el horario de/i), 'docente');
    await userEvent.selectOptions(await screen.findByLabelText(/docente/i), '5');
    expect(await screen.findByText(/Horario de Pepito Perez/i)).toBeInTheDocument();
    // La peticion a la semana debe ir filtrada por ese docente y no por salon.
    await waitFor(() => expect(screen.getByLabelText(/dia 1.*bloque 1.*Ciencias/i)).toBeInTheDocument());
  });

  it('elegir docente oculta el desplegable de salones y viceversa', async () => {
    pintarComo('COORDINADOR');
    await userEvent.selectOptions(await screen.findByLabelText(/ver el horario de/i), 'salon');
    expect(screen.getByLabelText(/salon/i)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/ver el horario de/i), 'docente');
    expect(screen.queryByLabelText(/salon/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/docente/i)).toBeInTheDocument();
  });

  it('un docente no ve el selector ni la lista de docentes', async () => {
    pintarComo('DOCENTE');
    await waitFor(() => expect(screen.getByText(/Ciencias/)).toBeInTheDocument());
    expect(screen.queryByLabelText(/ver el horario de/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/docente/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/salon/i)).not.toBeInTheDocument();
  });
});
