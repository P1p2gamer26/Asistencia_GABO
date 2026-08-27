import { api, apiUrl, OfflineError } from '../api/client';
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

  // `put` reemplaza el registro entero, asi que lo que no venga en `mark` se perderia.
  // El comentario se conserva salvo que se pase uno nuevo: el docente escribe el motivo
  // y despues corrige el estado, o pulsa Enviar, y en ambos casos se le borraba. Un
  // comentario vacio explicito si lo borra, que es lo que significa vaciar el campo.
  const comment = mark.comment === undefined ? previo?.comment : (mark.comment || undefined);

  await db.outbox.put({
    key,
    id: previo?.id ?? crypto.randomUUID(),
    ...mark,
    comment,
    recordedAt: new Date().toISOString(),
    error: undefined,
  });

  // Con internet, lo marcado sube solo en un par de segundos; sin internet esto no
  // hace nada visible y la marca se queda a salvo en la cola.
  sincronizarPronto();
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

/**
 * Que tan util es la copia local ahora mismo. Sin esto, un docente sin señal ve las
 * listas vacias y no puede distinguir "no descargue nunca" de "el curso esta vacio".
 */
export async function estadoDeDatos(): Promise<{
  descargado: string | null; dias: number | null; estudiantes: number;
}> {
  const meta = await db.meta.get('lastBootstrap');
  const estudiantes = await db.students.count();
  if (!meta?.value) return { descargado: null, dias: null, estudiantes };

  const dias = Math.floor((Date.now() - new Date(meta.value).getTime()) / 86_400_000);
  return { descargado: meta.value, dias, estudiantes };
}

/**
 * Sube los carnes escaneados en porteria. Vive aqui y no en la pantalla de Ingreso
 * porque una cola que solo se vacia con su pantalla abierta no es una cola offline:
 * es un formulario con memoria.
 */
export async function flushEntries(): Promise<{
  sent: number; pending: number; alcanzable: boolean; nombres: Record<string, string>;
}> {
  const cola = await db.entryOutbox.toArray();
  if (cola.length === 0) return { sent: 0, pending: 0, alcanzable: true, nombres: {} };

  // El contrato es `entries` (no `records` como en asistencia) y la respuesta trae
  // `names`: la porteria escanea un carne y necesita ver de quien es al confirmarlo.
  let result: {
    accepted: number;
    rejected: { id: string; reason: string }[];
    names: Record<string, string>;
  };
  try {
    result = await api.post('/api/entry/sync', {
      entries: cola.map(({ error, name, ...e }) => e),
    });
  } catch (e) {
    if (e instanceof OfflineError) {
      return { sent: 0, pending: cola.length, alcanzable: false, nombres: {} };
    }
    throw e;
  }

  const rechazados = new Map(result.rejected.map((r) => [r.id, r.reason]));
  await db.transaction('rw', db.entryOutbox, async () => {
    for (const e of cola) {
      const motivo = rechazados.get(e.id);
      if (motivo) await db.entryOutbox.update(e.id, { error: motivo });
      else await db.entryOutbox.delete(e.id);
    }
  });

  return {
    sent: result.accepted,
    pending: await db.entryOutbox.count(),
    alcanzable: true,
    nombres: result.names ?? {},
  };
}

/** Las dos colas de una pasada. Es lo que llama el sincronizador automatico. */
export async function flushAll(): Promise<{ pending: number; alcanzable: boolean }> {
  const marcas = await flushOutbox();
  const ingresos = await flushEntries();
  return {
    pending: marcas.pending + ingresos.pending,
    alcanzable: marcas.alcanzable && ingresos.alcanzable,
  };
}

/**
 * Quien quiere enterarse del estado de la sincronizacion. Es un conjunto y no un solo
 * callback porque la franja de estado, la planilla y cualquier pantalla futura miran
 * lo mismo: cuantas marcas quedan sin subir y si el servidor contesta.
 */
type Escucha = (pending: number, alcanzable: boolean) => void;
const escuchas = new Set<Escucha>();
const avisar = (pending: number, alcanzable: boolean) => {
  for (const f of escuchas) f(pending, alcanzable);
};

/**
 * Comprueba de verdad si el servidor contesta.
 *
 * Hace falta porque con la cola vacia no se envia nada, y "no hubo error" no es lo
 * mismo que "hay internet": la aplicacion diria "En linea" en un salon sin señal.
 * /actuator/health es publico (no pide sesion) y responde unos pocos bytes.
 *
 * navigator.onLine no sirve para esto: da true con el WiFi del colegio conectado pero
 * sin salida a internet, que es justo el caso que hay que detectar.
 */
export async function comprobarConexion(): Promise<boolean> {
  const corte = new AbortController();
  const reloj = window.setTimeout(() => corte.abort(), 5000);
  try {
    const res = await fetch(apiUrl('/actuator/health'), {
      cache: 'no-store',
      signal: corte.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(reloj);
  }
}

/**
 * Sube lo pendiente en cuanto se pueda, sin esperar al siguiente ciclo automatico.
 *
 * Va con una espera corta a proposito: al tomar lista se marcan cuarenta estudiantes
 * seguidos, y subir en cada pulsacion serian cuarenta peticiones. Con este respiro se
 * agrupan en una sola, y aun asi la marca llega al servidor en un par de segundos.
 */
let prontoTimer = 0;

/** Cancela la subida programada. La usan las pruebas para no cruzar una con otra. */
export function cancelarSincronizacionPronto(): void {
  window.clearTimeout(prontoTimer);
}

export function sincronizarPronto(esperaMs = 2000): void {
  window.clearTimeout(prontoTimer);
  prontoTimer = window.setTimeout(() => {
    void flushAll().then((r) => avisar(r.pending, r.alcanzable)).catch(() => {});
  }, esperaMs);
}

/**
 * Sincronizacion automatica de las dos colas.
 *
 * Los disparadores son los tres momentos en que de verdad puede haber cambiado algo:
 * al montar, cuando el navegador dice que volvio la red, y cuando la pantalla se
 * vuelve a ver (que en un celular es el desbloqueo, con los temporizadores congelados
 * hasta ese instante).
 *
 * La espera entre reintentos crece de 30 s a 5 min: sin señal, insistir cada minuto
 * durante una jornada entera se come la bateria sin conseguir nada. Vuelve al minimo
 * en cuanto un intento llega al servidor.
 */
export function startAutoSync(onChange?: (pending: number, alcanzable: boolean) => void) {
  const MIN = 30_000;
  const MAX = 300_000;
  let espera = MIN;
  let timer = 0;
  let vivo = true;

  const programar = () => {
    window.clearTimeout(timer);
    if (!vivo) return;
    timer = window.setTimeout(intentar, espera);
  };

  const intentar = async () => {
    if (!vivo) return;
    // flushOutbox y flushEntries ya salen antes de tocar la red si su cola esta
    // vacia: una cola vacia no justifica encender la radio del telefono.
    const r = await flushAll().catch(() => null);
    if (r) {
      espera = r.alcanzable ? MIN : Math.min(espera * 2, MAX);
      avisar(r.pending, r.alcanzable);
    }
    programar();
  };

  /**
   * Con la cola vacia no se envia nada, asi que flushAll devuelve alcanzable=true sin
   * haber hablado con nadie. Para poder decir "En linea" sin mentir hay que preguntar.
   * Solo en los disparadores (montaje, vuelta de red, pantalla visible), nunca en
   * bucle: es una PWA de celular y esto enciende la radio.
   */
  const revisarEstado = async () => {
    if (!vivo) return;
    const hay = (await db.outbox.count()) + (await db.entryOutbox.count());
    if (hay > 0) return;   // hay algo que subir: el propio envio dira si se alcanza
    const ok = await comprobarConexion();
    if (vivo) avisar(0, ok);
  };

  const alVolver = () => { espera = MIN; void intentar(); void revisarEstado(); };
  // El evento 'offline' si es fiable en su direccion: si el sistema dice que no hay
  // red, no la hay. El 'online' solo dice que hay una interfaz levantada, por eso ese
  // camino termina preguntando al servidor en vez de creerselo.
  const alCaerse = () => avisar(0, false);
  const alVerse = () => { if (document.visibilityState === 'visible') alVolver(); };

  if (onChange) escuchas.add(onChange);
  window.addEventListener('online', alVolver);
  window.addEventListener('offline', alCaerse);
  document.addEventListener('visibilitychange', alVerse);
  void intentar();
  void revisarEstado();

  return () => {
    vivo = false;
    window.clearTimeout(timer);
    if (onChange) escuchas.delete(onChange);
    window.removeEventListener('online', alVolver);
    window.removeEventListener('offline', alCaerse);
    document.removeEventListener('visibilitychange', alVerse);
  };
}
