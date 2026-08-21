import Dexie, { type Table } from 'dexie';
import type { Block, StudentDto, SchoolDay, Status } from '../api/contract';

export type OutboxRecord = {
  key: string;              // `${studentId}:${blockId}:${classDate}` — evita duplicados locales
  id: string;               // UUID que viaja al servidor
  studentId: number;
  scheduleBlockId: number;
  classDate: string;        // YYYY-MM-DD
  status: Status;
  comment?: string;
  recordedAt: string;       // ISO-8601 con offset
  error?: string;
};

export type OutboxEntry = {
  id: string; documentId: string; scannedAt: string; name?: string; error?: string;
};

class LocalDb extends Dexie {
  blocks!: Table<Block, number>;
  students!: Table<StudentDto, number>;
  schoolDays!: Table<SchoolDay, string>;
  outbox!: Table<OutboxRecord, string>;
  entryOutbox!: Table<OutboxEntry, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super('ggm-asistencia');
    this.version(1).stores({
      blocks: 'id, grade, weekday',
      students: 'id, grade, documentId',
      schoolDays: 'calendarDate, dayType',
      outbox: 'key, classDate, error',
      entryOutbox: 'id, scannedAt, error',
      meta: 'key',
    });
  }
}

export const db = new LocalDb();

/** Un dia es lectivo solo si el calendario descargado lo dice. Sin calendario, no se asume nada. */
export async function isSchoolDay(fecha: string): Promise<boolean> {
  const dia = await db.schoolDays.get(fecha);
  return dia?.dayType === 'LECTIVO';
}
