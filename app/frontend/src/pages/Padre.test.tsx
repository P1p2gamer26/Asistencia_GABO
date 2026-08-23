import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Padre from './Padre';

const DOS_HIJOS = [
  { studentId: 1, fullName: 'Ana Perez', grade: '601',
    schoolDays: 10, recordedDays: 8, asistio: 6, falto: 1, tarde: 1, evadio: 0,
    recent: [{ classDate: '2026-08-04', subject: 'Ciencias', status: 'F' }],
    horario: [{ weekday: 1, blockNo: 1, subject: 'Ciencias', room: 'Laboratorio 1',
                startTime: '07:00', endTime: '07:50', teacherName: 'Pepito Perez' }] },
  { studentId: 2, fullName: 'Luis Perez', grade: '802',
    schoolDays: 10, recordedDays: 0, asistio: 0, falto: 0, tarde: 0, evadio: 0,
    recent: [], horario: [] },
];

const HIJOS = [
  {
    studentId: 2,
    fullName: 'JUAN DIEGO AVILA VERGARA',
    grade: '601',
    schoolDays: 3,
    recordedDays: 3,
    recent: [
      { classDate: '2026-08-20', subject: 'Matematicas', status: 'F' },
      { classDate: '2026-08-19', subject: 'Espanol', status: 'T', comment: 'Bus demorado' },
      { classDate: '2026-08-18', subject: 'Matematicas', status: 'P' },
    ],
  },
];

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Padre', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ACUDIENTE',
      fullName: 'Maria Figueroa', userId: 9,
    }));
  });

  it('muestra el nombre del hijo y su curso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HIJOS)));
    render(<Padre />);
    await waitFor(() => {
      expect(screen.getByText(/JUAN DIEGO AVILA VERGARA/)).toBeInTheDocument();
      expect(screen.getByText(/601/)).toBeInTheDocument();
    });
  });

  it('traduce los estados a texto legible, no muestra letras sueltas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HIJOS)));
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/No asistio/i)).toBeInTheDocument());
    expect(screen.getByText(/Llego tarde/i)).toBeInTheDocument();
  });

  it('no lista los dias en que el estudiante asistio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HIJOS)));
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/No asistio/i)).toBeInTheDocument());
    // Solo interesan las novedades: un listado con los 190 dias presentes seria inutil.
    expect(screen.queryByText(/^Presente$/i)).not.toBeInTheDocument();
  });

  it('muestra el comentario del docente cuando lo hay', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HIJOS)));
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/Bus demorado/)).toBeInTheDocument());
  });

  it('cuenta las novedades, no los registros totales', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(HIJOS)));
    render(<Padre />);
    // De los tres registros, dos son novedad (F y T) y uno es asistencia normal.
    await waitFor(() => expect(screen.getByText(/2 novedad/i)).toBeInTheDocument());
  });

  it('sin conexion lo dice en vez de fingir que no hay novedades', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    render(<Padre />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo consultar/i));
  });

  it('un acudiente sin hijos registrados no rompe la pantalla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([])));
    render(<Padre />);
    await waitFor(() =>
      expect(screen.getByText(/Maria Figueroa/)).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sin ningun registro lo dice, en vez de dar a entender que todo fue bien', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([{
      studentId: 2, fullName: 'JUAN AVILA', grade: '601',
      schoolDays: 12, recordedDays: 0, recent: [],
    }])));
    render(<Padre />);
    await waitFor(() =>
      expect(screen.getByText(/todavia no hay registros/i)).toBeInTheDocument());
    expect(screen.queryByText(/0 novedad/i)).not.toBeInTheDocument();
  });

  it('con registros y sin novedades tranquiliza con fundamento', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([{
      studentId: 2, fullName: 'JUAN AVILA', grade: '601',
      schoolDays: 12, recordedDays: 12, recent: [],
    }])));
    render(<Padre />);
    await waitFor(() =>
      expect(screen.getByText(/asistio a las 12 clases registradas/i)).toBeInTheDocument());
  });

  it('con registros parciales dice cuantos dias cubre', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([{
      studentId: 2, fullName: 'JUAN AVILA', grade: '601',
      schoolDays: 12, recordedDays: 5, recent: [],
    }])));
    render(<Padre />);
    await waitFor(() =>
      expect(screen.getByText(/5 de 12/i)).toBeInTheDocument());
  });

  it('con novedades las lista, como antes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([{
      studentId: 2, fullName: 'JUAN AVILA', grade: '601',
      schoolDays: 12, recordedDays: 12,
      recent: [{ classDate: '2026-08-20', subject: 'Matematicas', status: 'F' }],
    }])));
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/No asistio/i)).toBeInTheDocument());
  });

  // ---- dos hijos, contadores y horario ----

  it('muestra a los dos hijos, cada uno con su curso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DOS_HIJOS)));
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/Ana Perez/)).toBeInTheDocument());
    expect(screen.getByText(/Luis Perez/)).toBeInTheDocument();
    expect(screen.getByText(/601/)).toBeInTheDocument();
    expect(screen.getByText(/802/)).toBeInTheDocument();
  });

  it('dice cuantos dias asistio y cuantos falto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DOS_HIJOS)));
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/6 .*asisti/i)).toBeInTheDocument());
    expect(screen.getByText(/1 .*falt/i)).toBeInTheDocument();
  });

  it('sin registros no dice que asistio siempre', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DOS_HIJOS)));
    render(<Padre />);
    // Luis no tiene un solo registro. Decir "0 faltas" seria prometer una tranquilidad
    // que el sistema no puede respaldar: nadie ha tomado su asistencia.
    await waitFor(() => expect(screen.getByText(/Luis Perez/)).toBeInTheDocument());
    const seccion = screen.getByText(/Luis Perez/).closest('section')!;
    expect(seccion).toHaveTextContent(/todavia no hay registros/i);
    expect(seccion).not.toHaveTextContent(/sin novedades/i);
    expect(seccion).not.toHaveTextContent(/asistio a las/i);
    // Sin un solo registro, no se pinta ningun contador (ni siquiera en cero).
    expect(seccion.querySelector('.conteo-hijo')).toBeNull();
  });

  it('muestra el horario del hijo con el aula y el docente', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DOS_HIJOS)));
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/Ana Perez/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /horario de Ana Perez/i }));
    expect(screen.getByText(/Laboratorio 1/)).toBeInTheDocument();
    expect(screen.getByText(/Pepito Perez/)).toBeInTheDocument();
    expect(screen.getByText(/lunes/i)).toBeInTheDocument();
  });

  it('un hijo sin horario cargado lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(DOS_HIJOS)));
    render(<Padre />);
    await waitFor(() => expect(screen.getByText(/Luis Perez/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /horario de Luis Perez/i }));
    expect(screen.getByText(/no tiene horario cargado/i)).toBeInTheDocument();
  });
});
