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

    // Version 2: indice por bloque en la cola. Al abrir un bloque, TomarAsistencia
    // recorria la cola entera para encontrar lo suyo; con la jornada de un colegio
    // entero en el telefono eso empieza a notarse.
    //
    // Que destruye datos locales al subir de version, VERIFICADO contra el codigo de
    // Dexie (ver deleteRemovedTables en dexie.js), no contra lo que suele repetirse:
    //
    //   - Anadir un indice NO borra nada: Dexie reindexa lo que ya hay.
    //   - Omitir una tabla en el stores de la version nueva TAMPOCO la borra: se
    //     hereda del esquema anterior. Aun asi se declaran las seis, que es lo claro.
    //   - Lo que SI destruye datos es `tabla: null` explicito, o cambiarle la clave
    //     primaria a una tabla. Eso ultimo es lo que cubre la prueba de local.test.ts.
    //
    // Importa porque en outbox vive la asistencia de una jornada que aun no ha subido:
    // aqui una equivocacion no se arregla volviendo a desplegar. Por eso el bloque de
    // la version 1 se queda tal cual esta, para siempre.
    this.version(2).stores({
      blocks: 'id, grade, weekday',
      students: 'id, grade, documentId',
      schoolDays: 'calendarDate, dayType',
      outbox: 'key, classDate, error, scheduleBlockId',
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
