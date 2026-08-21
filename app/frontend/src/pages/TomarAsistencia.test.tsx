import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/local';
import TomarAsistencia from './TomarAsistencia';

const HOY = new Date().toLocaleDateString('en-CA');

describe('TomarAsistencia', () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.blocks.clear();
    await db.students.clear();
    await db.schoolDays.clear();

    await db.schoolDays.bulkPut([{ calendarDate: HOY, dayType: 'LECTIVO' }]);
    await db.blocks.bulkPut([
      { id: 1, grade: '601', weekday: 1, blockNo: 1, subject: 'Matematicas', startTime: '06:30' },
      { id: 2, grade: '602', weekday: 1, blockNo: 2, subject: 'Espanol', startTime: '07:20' },
    ]);
    await db.students.bulkPut([
      { id: 10, documentId: '111', fullName: 'ANA LOPEZ', grade: '601' },
      { id: 11, documentId: '222', fullName: 'BETO RUIZ', grade: '601' },
      { id: 12, documentId: '333', fullName: 'CARLA DIAZ', grade: '602' },
    ]);
  });

  it('sin curso elegido no muestra estudiantes', async () => {
    render(<TomarAsistencia />);
    expect(await screen.findByText(/elija curso y bloque/i)).toBeInTheDocument();
  });

  it('al elegir curso y bloque muestra solo los estudiantes de ese curso', async () => {
    render(<TomarAsistencia />);
    await waitFor(() => expect(
      screen.getByLabelText(/curso/i).querySelectorAll('option').length).toBeGreaterThan(1));

    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await waitFor(() => expect(screen.getByLabelText(/bloque/i)).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText(/bloque/i), '1');

    expect(await screen.findByText('ANA LOPEZ')).toBeInTheDocument();
    expect(screen.getByText('BETO RUIZ')).toBeInTheDocument();
    expect(screen.queryByText('CARLA DIAZ')).not.toBeInTheDocument();
  });

  it('marcar una falta la deja en la cola local, sin tocar la red', async () => {
    render(<TomarAsistencia />);
    await waitFor(() => expect(
      screen.getByLabelText(/curso/i).querySelectorAll('option').length).toBeGreaterThan(1));
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
    render(<TomarAsistencia />);
    await waitFor(() => expect(
      screen.getByLabelText(/curso/i).querySelectorAll('option').length).toBeGreaterThan(1));
    const opciones = Array.from(screen.getByLabelText(/curso/i).querySelectorAll('option'))
      .map((o) => o.value)
      .filter(Boolean);
    expect(opciones.sort()).toEqual(['601', '602']);
  });
});
