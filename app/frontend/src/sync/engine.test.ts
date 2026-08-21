import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/local';
import { markAttendance, flushOutbox, pendingCount, downloadBootstrap } from './engine';

const base = { studentId: 1, scheduleBlockId: 7, classDate: '2026-07-13' } as const;

describe('motor de sincronizacion', () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.schoolDays.clear();
    await db.schoolDays.bulkPut([
      { calendarDate: '2026-07-13', dayType: 'LECTIVO' },
      { calendarDate: '2026-07-20', dayType: 'FESTIVO' },
    ]);
    vi.unstubAllGlobals();
  });

  it('marcar asistencia sin red no falla y deja el registro pendiente', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await markAttendance({ ...base, status: 'P' });
    expect(await pendingCount()).toBe(1);
  });

  it('rechaza marcar en un dia no lectivo antes de gastar red', async () => {
    await expect(markAttendance({ ...base, classDate: '2026-07-20', status: 'P' }))
      .rejects.toThrow('no es un dia lectivo');
    expect(await pendingCount()).toBe(0);
  });

  it('rechaza marcar en una fecha que no esta en el calendario descargado', async () => {
    await expect(markAttendance({ ...base, classDate: '2027-01-04', status: 'P' }))
      .rejects.toThrow('no es un dia lectivo');
  });

  it('remarcar al mismo estudiante reemplaza la entrada y conserva el uuid', async () => {
    await markAttendance({ ...base, status: 'P' });
    const primero = (await db.outbox.toArray())[0].id;
    await markAttendance({ ...base, status: 'T' });
    expect(await pendingCount()).toBe(1);
    const [solo] = await db.outbox.toArray();
    expect(solo.status).toBe('T');
    expect(solo.id).toBe(primero);
  });

  it('flush borra lo aceptado y conserva lo rechazado con su motivo', async () => {
    await markAttendance({ ...base, status: 'P' });
    await markAttendance({ ...base, studentId: 2, status: 'F' });
    const rechazado = (await db.outbox.toArray()).find((r) => r.studentId === 2)!;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ accepted: 1, rejected: [{ id: rechazado.id, reason: 'Estudiante inexistente' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const res = await flushOutbox();

    expect(res.sent).toBe(1);
    const quedan = await db.outbox.toArray();
    expect(quedan).toHaveLength(1);
    expect(quedan[0].error).toBe('Estudiante inexistente');
  });

  it('estando offline el flush no pierde nada', async () => {
    await markAttendance({ ...base, status: 'P' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    const res = await flushOutbox();
    expect(res.sent).toBe(0);
    expect(await pendingCount()).toBe(1);
  });

  it('el bootstrap guarda tambien el calendario', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      blocks: [], students: [],
      schoolDays: [{ calendarDate: '2026-08-10', dayType: 'LECTIVO' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await downloadBootstrap();
    expect((await db.schoolDays.get('2026-08-10'))?.dayType).toBe('LECTIVO');
  });
});
