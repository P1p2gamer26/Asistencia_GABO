import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/local';
import { markAttendance, flushOutbox, flushAll, pendingCount, startAutoSync, downloadBootstrap, estadoDeDatos } from './engine';

const base = { studentId: 1, scheduleBlockId: 7, classDate: '2026-07-13' } as const;

describe('motor de sincronizacion', () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.entryOutbox.clear();
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

  it('cambiar el estado no borra el comentario que el docente ya escribio', async () => {
    await markAttendance({ ...base, status: 'T', comment: 'El bus se demoro' });
    await markAttendance({ ...base, status: 'F' });   // el docente corrige el estado
    const [r] = await db.outbox.toArray();
    expect(r.status).toBe('F');
    expect(r.comment).toBe('El bus se demoro');
  });

  it('un comentario vacio explicito si lo borra', async () => {
    await markAttendance({ ...base, status: 'T', comment: 'El bus se demoro' });
    await markAttendance({ ...base, status: 'T', comment: '' });
    const [r] = await db.outbox.toArray();
    expect(r.comment).toBeFalsy();
  });

  it('vaciar todo sube tambien la cola de porteria, no solo la de asistencia', async () => {
    await db.entryOutbox.clear();
    await db.entryOutbox.put({
      id: 'e1', documentId: '111', scannedAt: '2026-07-13T06:40:00Z',
    });
    await markAttendance({ ...base, status: 'P' });

    const enviados: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      enviados.push(new URL(url, 'http://x').pathname);
      return new Response(JSON.stringify({ accepted: 1, rejected: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const r = await flushAll();

    expect(enviados).toContain('/api/attendance/sync');
    expect(enviados.some((p) => p.startsWith('/api/entry'))).toBe(true);
    expect(r.pending).toBe(0);
    expect(await db.entryOutbox.count()).toBe(0);
  });

  it('sin red, ninguna de las dos colas se pierde', async () => {
    await db.entryOutbox.clear();
    await db.entryOutbox.put({
      id: 'e2', documentId: '222', scannedAt: '2026-07-13T06:41:00Z',
    });
    await markAttendance({ ...base, status: 'F' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));

    const r = await flushAll();

    expect(r.alcanzable).toBe(false);
    expect(r.pending).toBe(2);   // una marca + un ingreso
    expect(await db.entryOutbox.count()).toBe(1);
    expect(await pendingCount()).toBe(1);
  });

  it('reintenta en cuanto la pantalla vuelve a estar visible', async () => {
    await markAttendance({ ...base, status: 'P' });
    let intentos = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      intentos++;
      throw new TypeError('network');
    }));

    const detener = startAutoSync();
    await vi.waitFor(() => expect(intentos).toBeGreaterThanOrEqual(1));
    const tras_montar = intentos;

    // Desbloquear el telefono: es cuando de verdad puede haber vuelto la señal.
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(intentos).toBeGreaterThan(tras_montar));

    detener();
  });

  it('sin nada pendiente no toca la red', async () => {
    await db.outbox.clear();
    await db.entryOutbox.clear();
    let intentos = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { intentos++; throw new TypeError('network'); }));

    const detener = startAutoSync();
    await new Promise((r) => setTimeout(r, 50));
    detener();

    // Una cola vacia no justifica encender la radio del telefono.
    expect(intentos).toBe(0);
  });

  it('dice cuando se descargaron los datos y cuantos estudiantes hay', async () => {
    await db.meta.clear();
    await db.students.clear();
    await db.students.bulkPut([
      { id: 1, documentId: '111', fullName: 'ANA LOPEZ', grade: '6A' },
      { id: 2, documentId: '222', fullName: 'BETO RUIZ', grade: '6A' },
    ]);
    const haceDosDias = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await db.meta.put({ key: 'lastBootstrap', value: haceDosDias });

    const e = await estadoDeDatos();
    expect(e.estudiantes).toBe(2);
    expect(e.dias).toBe(2);
  });

  it('sin ninguna descarga previa lo dice en vez de fingir que hay datos', async () => {
    await db.meta.clear();
    await db.students.clear();

    const e = await estadoDeDatos();
    expect(e.descargado).toBeNull();
    expect(e.dias).toBeNull();
    expect(e.estudiantes).toBe(0);
  });
});
