import { api, OfflineError } from '../api/client';
import type { Bootstrap, Status } from '../api/contract';
import { db, isSchoolDay } from '../db/local';

type Mark = {
  studentId: number;
  scheduleBlockId: number;
  classDate: string;
  status: Status;
  comment?: string;
};

const keyOf = (m: Mark) => `${m.studentId}:${m.scheduleBlockId}:${m.classDate}`;

/**
 * Escritura puramente local: nunca toca la red, el docente esta en el salon sin senal.
 * Lanza si la fecha no es lectiva — la misma regla del servidor, aplicada antes de gastar bateria.
 */
export async function markAttendance(mark: Mark): Promise<void> {
  if (!(await isSchoolDay(mark.classDate))) {
    throw new Error(`${mark.classDate} no es un dia lectivo`);
  }
  const key = keyOf(mark);
  const previo = await db.outbox.get(key);
  await db.outbox.put({
    key,
    id: previo?.id ?? crypto.randomUUID(),
    ...mark,
    recordedAt: new Date().toISOString(),
    error: undefined,
  });
}

export const pendingCount = () => db.outbox.count();

export async function flushOutbox(): Promise<{ sent: number; pending: number; alcanzable: boolean }> {
  const records = await db.outbox.toArray();
  if (records.length === 0) return { sent: 0, pending: 0, alcanzable: true };

  let result: { accepted: number; rejected: { id: string; reason: string }[] };
  try {
    result = await api.post('/api/attendance/sync', {
      records: records.map(({ key, error, ...r }) => r),
    });
  } catch (e) {
    // OfflineError significa que la peticion no llego a ninguna parte. Es la unica
    // senal fiable: navigator.onLine dice true con WiFi sin internet, que es
    // exactamente lo que pasa en el colegio.
    if (e instanceof OfflineError) return { sent: 0, pending: records.length, alcanzable: false };
    throw e;
  }

  const rechazados = new Map(result.rejected.map((r) => [r.id, r.reason]));
  await db.transaction('rw', db.outbox, async () => {
    for (const r of records) {
      const motivo = rechazados.get(r.id);
      if (motivo) await db.outbox.update(r.key, { error: motivo });
      else await db.outbox.delete(r.key);
    }
  });

  return { sent: result.accepted, pending: await pendingCount(), alcanzable: true };
}

export async function downloadBootstrap(): Promise<void> {
  const data = await api.get<Bootstrap>('/api/sync/bootstrap');
  await db.transaction('rw', db.blocks, db.students, db.schoolDays, db.meta, async () => {
    await db.blocks.clear();
    await db.blocks.bulkPut(data.blocks);
    await db.students.clear();
    await db.students.bulkPut(data.students);
    // El calendario se fusiona, no se limpia: el servidor baja una ventana de cuatro
    // meses y un clear perderia dias validos ya descargados.
    await db.schoolDays.bulkPut(data.schoolDays);
    await db.meta.put({ key: 'lastBootstrap', value: new Date().toISOString() });
  });
}

/** Intenta vaciar el outbox cuando el navegador recupera la conexion. */
export function startAutoSync(onChange?: (pending: number, alcanzable: boolean) => void) {
  const intentar = async () => {
    const r = await flushOutbox().catch(() => null);
    if (r) onChange?.(r.pending, r.alcanzable);
  };
  window.addEventListener('online', intentar);
  const timer = window.setInterval(intentar, 60_000);
  void intentar();
  return () => {
    window.removeEventListener('online', intentar);
    window.clearInterval(timer);
  };
}
