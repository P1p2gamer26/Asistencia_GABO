import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from './local';

describe('base local', () => {
  it('una marca guardada sobrevive a abrir la base otra vez', async () => {
    // Es lo que pasa en cada actualizacion de la aplicacion: si al subir de version
    // la migracion esta mal, esto se lleva por delante la jornada sin subir.
    await db.outbox.clear();
    await db.outbox.put({
      key: '1:7:2026-07-13', id: 'u1', studentId: 1, scheduleBlockId: 7,
      classDate: '2026-07-13', status: 'P', recordedAt: '2026-07-13T12:00:00Z',
    });

    await db.close();
    await db.open();

    expect(await db.outbox.count()).toBe(1);
    expect((await db.outbox.get('1:7:2026-07-13'))?.status).toBe('P');
  });

  it('se puede buscar lo pendiente de un bloque sin recorrer toda la cola', async () => {
    await db.outbox.clear();
    await db.outbox.bulkPut([
      { key: '1:7:2026-07-13', id: 'a', studentId: 1, scheduleBlockId: 7,
        classDate: '2026-07-13', status: 'P', recordedAt: '2026-07-13T12:00:00Z' },
      { key: '2:9:2026-07-13', id: 'b', studentId: 2, scheduleBlockId: 9,
        classDate: '2026-07-13', status: 'F', recordedAt: '2026-07-13T12:00:00Z' },
    ]);

    const delBloque = await db.outbox.where('scheduleBlockId').equals(7).toArray();
    expect(delBloque).toHaveLength(1);
    expect(delBloque[0].id).toBe('a');
  });
});

