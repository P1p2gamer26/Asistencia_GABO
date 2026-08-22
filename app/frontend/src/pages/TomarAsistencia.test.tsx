import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/local';
import { MemoryRouter } from 'react-router-dom';
import TomarAsistencia from './TomarAsistencia';

const HOY = new Date().toLocaleDateString('en-CA');

describe('TomarAsistencia', () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.blocks.clear();
    await db.students.clear();
    await db.schoolDays.clear();

    await db.schoolDays.bulkPut([
      { calendarDate: HOY, dayType: 'LECTIVO' },
      { calendarDate: '2026-08-17', dayType: 'LECTIVO' },   // lunes
      { calendarDate: '2026-08-18', dayType: 'LECTIVO' },   // martes
    ]);
    await db.blocks.bulkPut([
      { id: 1, grade: '601', weekday: 1, blockNo: 4, subject: 'Ciencias', startTime: '09:00' },
      { id: 2, grade: '601', weekday: 2, blockNo: 4, subject: 'Ciencias', startTime: '09:00' },
      { id: 3, grade: '601', weekday: 3, blockNo: 4, subject: 'Ciencias', startTime: '09:00' },
      { id: 4, grade: '602', weekday: 1, blockNo: 2, subject: 'Espanol', startTime: '07:20' },
    ]);
    await db.students.bulkPut([
      { id: 10, documentId: '111', fullName: 'ANA LOPEZ', grade: '601' },
      { id: 11, documentId: '222', fullName: 'BETO RUIZ', grade: '601' },
      { id: 12, documentId: '333', fullName: 'CARLA DIAZ', grade: '602' },
    ]);
  });

  it('sin curso elegido no muestra estudiantes', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    expect(await screen.findByText(/elija curso y bloque/i)).toBeInTheDocument();
  });

  it('al elegir curso y bloque muestra solo los estudiantes de ese curso', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(
      screen.getByLabelText(/curso/i).querySelectorAll('option').length).toBeGreaterThan(1));

    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');   // lunes
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await waitFor(() => expect(screen.getByLabelText(/bloque/i)).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText(/bloque/i), '1');

    expect(await screen.findByText('ANA LOPEZ')).toBeInTheDocument();
    expect(screen.getByText('BETO RUIZ')).toBeInTheDocument();
    expect(screen.queryByText('CARLA DIAZ')).not.toBeInTheDocument();
  });

  it('marcar una falta la deja en la cola local, sin tocar la red', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(
      screen.getByLabelText(/curso/i).querySelectorAll('option').length).toBeGreaterThan(1));
    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');   // lunes
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await waitFor(() => expect(screen.getByLabelText(/bloque/i)).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText(/bloque/i), '1');

    const grupo = await screen.findByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: 'F' }));

    await waitFor(async () => {
      const cola = await db.outbox.toArray();
      expect(cola).toHaveLength(1);
      expect(cola[0].studentId).toBe(10);
      expect(cola[0].status).toBe('F');
    });
  });

  it('el curso ofrecido es solo el del horario del docente', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(
      screen.getByLabelText(/curso/i).querySelectorAll('option').length).toBeGreaterThan(1));
    const opciones = Array.from(screen.getByLabelText(/curso/i).querySelectorAll('option'))
      .map((o) => o.value)
      .filter(Boolean);
    expect(opciones.sort()).toEqual(['601', '602']);
  });

  it('solo ofrece los bloques del dia de la fecha elegida', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');   // lunes
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');

    await waitFor(() => {
      const opciones = Array.from(
        screen.getByLabelText(/bloque/i).querySelectorAll('option'))
        .map((o) => o.value).filter(Boolean);
      // De los tres bloques de 601, solo el del lunes (id 1)
      expect(opciones).toEqual(['1']);
    });
  });

  it('al cambiar de dia cambian los bloques ofrecidos', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');

    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-18');   // martes

    await waitFor(() => {
      const opciones = Array.from(
        screen.getByLabelText(/bloque/i).querySelectorAll('option'))
        .map((o) => o.value).filter(Boolean);
      expect(opciones).toEqual(['2']);
    });
  });

  it('nunca ofrece dos opciones con el mismo texto', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');

    await waitFor(() => {
      const textos = Array.from(
        screen.getByLabelText(/bloque/i).querySelectorAll('option'))
        .map((o) => o.textContent ?? '').filter((t) => !t.includes('Seleccione'));
      // Este es el bug que motivo la tarea: cinco opciones "4. Ciencias (09:00)"
      // identicas, y elegir la equivocada guardaba la asistencia en otro dia.
      expect(new Set(textos).size).toBe(textos.length);
    });
  });

  it('la opcion dice tambien el dia', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');

    await waitFor(() =>
      expect(screen.getByLabelText(/bloque/i)).toHaveTextContent(/lunes/i));
  });

  async function elegirCursoYBloque() {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');   // lunes
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await waitFor(() => expect(screen.getByLabelText(/bloque/i)).not.toBeDisabled());
    const opciones = Array.from(screen.getByLabelText(/bloque/i).querySelectorAll('option'))
      .map((o) => o.value).filter(Boolean);
    await userEvent.selectOptions(screen.getByLabelText(/bloque/i), opciones[0]);
    await screen.findByText('ANA LOPEZ');
  }

  it('enviar registra a TODOS los estudiantes, no solo a los tocados', async () => {
    await elegirCursoYBloque();

    // Se marca una sola falta; los demas se quedan como estan (presentes por defecto).
    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: 'F' }));

    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    await waitFor(async () => {
      const cola = await db.outbox.toArray();
      // Este era el defecto: quedaba 1 registro de un curso de 2 estudiantes.
      expect(cola).toHaveLength(2);
    });
    const cola = await db.outbox.toArray();
    expect(cola.find((r) => r.studentId === 10)?.status).toBe('F');
    expect(cola.find((r) => r.studentId === 11)?.status).toBe('P');
  });

  it('un curso que asiste completo tambien se puede enviar', async () => {
    await elegirCursoYBloque();

    // Sin tocar nada: antes el boton estaba deshabilitado y no se podia registrar nada.
    const boton = screen.getByRole('button', { name: /enviar asistencia/i });
    expect(boton).not.toBeDisabled();
    await userEvent.click(boton);

    await waitFor(async () => {
      const cola = await db.outbox.toArray();
      expect(cola).toHaveLength(2);
      expect(cola.every((r) => r.status === 'P')).toBe(true);
    });
  });

  it('el boton dice cuantos se van a enviar, no cuantos se tocaron', async () => {
    await elegirCursoYBloque();
    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: 'F' }));

    // Con 2 estudiantes en el curso y 1 tocado, debe anunciar 2.
    expect(screen.getByRole('button', { name: /enviar asistencia \(2\)/i })).toBeInTheDocument();
  });

  it('sin bloque elegido no ofrece enviar', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /enviar asistencia/i })).toBeDisabled();
  });

  it('enviar conserva el motivo que el docente escribio', async () => {
    await elegirCursoYBloque();

    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: 'T' }));

    const motivo = await screen.findByLabelText(/motivo/i);
    await userEvent.type(motivo, 'El bus se demoro');
    await userEvent.tab();

    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    await waitFor(async () => {
      const cola = await db.outbox.toArray();
      const ana = cola.find((r) => r.studentId === 10);
      // El defecto: enviar reconstruia los registros y perdia el motivo.
      expect(ana?.comment).toBe('El bus se demoro');
      expect(ana?.status).toBe('T');
    });
  });

  it('el motivo sobrevive a que el docente corrija el estado', async () => {
    await elegirCursoYBloque();

    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: 'T' }));
    await userEvent.type(await screen.findByLabelText(/motivo/i), 'El bus se demoro');
    await userEvent.tab();

    // Se lo piensa mejor y lo pone como falta
    await userEvent.click(within(grupo).getByRole('button', { name: 'F' }));
    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    await waitFor(async () => {
      const ana = (await db.outbox.toArray()).find((r) => r.studentId === 10);
      expect(ana?.status).toBe('F');
      expect(ana?.comment).toBe('El bus se demoro');
    });
  });

  it('volver a presente borra el motivo, que ya no tiene sentido', async () => {
    await elegirCursoYBloque();

    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: 'T' }));
    await userEvent.type(await screen.findByLabelText(/motivo/i), 'El bus se demoro');
    await userEvent.tab();
    await userEvent.click(within(grupo).getByRole('button', { name: 'P' }));

    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    await waitFor(async () => {
      const ana = (await db.outbox.toArray()).find((r) => r.studentId === 10);
      expect(ana?.status).toBe('P');
      // Un motivo de tardanza en alguien que llego a tiempo confunde al acudiente.
      expect(ana?.comment).toBeFalsy();
    });
  });
});
