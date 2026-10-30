import type { Session } from './contract';
import { guardarLectura, ultimaLectura } from './cacheLectura';
import { db, type CambioPendiente } from '../db/local';
import { guardarCredencial, entrarSinRed } from './credencialLocal';
export type { Session };

const KEY = 'ggm.session';

// Sin red el cambio se guarda en el equipo y se aplica solo despues: para quien lo hace
// es igual que con conexion, asi que se confirma igual.
export const AVISO_ENCOLADO = 'Guardado.';

/**
 * En desarrollo y en la imagen Docker el backend sirve el frontend, asi que la ruta
 * relativa funciona. En Vercel la API vive en otro dominio (Fly.io) y hace falta la
 * URL absoluta. Una sola variable decide las dos situaciones.
 */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  return BASE + path;
}

export function getSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

function setSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** Error de red: la peticion no llego. Distinto de un error del servidor. */
export class OfflineError extends Error {}
/** Respuesta HTTP que llego al servidor; conserva el estado para aislar lotes 400. */
export class HttpError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/**
 * Tope de espera por peticion. Sin el, una peticion colgada con señal de una rayita
 * frenaba minutos el reintento automatico (que espera a que termine). Render gratis
 * tarda ~3 min en despertar (medido oct-2026): el tope cubre ese arranque (200 s) para
 * que la primera entrada del dia no diga "Sin conexion" mientras el servidor despierta;
 * AvisoServidorLento explica la espera. Sin red de verdad fetch falla al instante, asi
 * que este tope solo afecta a las peticiones colgadas.
 */
export const TOPE_PETICION_MS = 200_000;

/**
 * Si una peticion tarda mas que esto sin respuesta, se avisa que el servidor esta
 * despertando (Render gratis tarda ~3 min en la primera entrada del dia). Es solo
 * informativo: no corta la peticion, de eso se encarga TOPE_PETICION_MS.
 */
export const UMBRAL_LENTO_MS = 8_000;

/** Bandera de modulo: hay al menos una peticion sin respuesta desde hace rato. */
let lento = false;

/** Para que la interfaz sepa si el servidor esta tardando en contestar. */
export function servidorLento(): boolean {
  return lento;
}

/**
 * Cambia la bandera y avisa a quien escuche, pero solo cuando el valor cambia:
 * sin esa guarda una rafaga de peticiones lentas dispararia el evento una vez
 * por cada una.
 */
function marcarServidorLento(valor: boolean) {
  if (valor === lento) return;
  lento = valor;
  window.dispatchEvent(new Event('servidor-lento'));
}

async function request<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const session = getSession();
  let res: Response;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), TOPE_PETICION_MS);
  const relojLento = setTimeout(() => marcarServidorLento(true), UMBRAL_LENTO_MS);
  try {
    res = await fetch(apiUrl(path), {
      signal: corte.signal,
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new OfflineError('Sin conexion');
  } finally {
    clearTimeout(reloj);
    clearTimeout(relojLento);
  }
  // Llego una respuesta HTTP que no es de las que pone el proxy: el servidor
  // contesto, asi que ya no esta despertando. Un timeout o un error de red no
  // pasan por aqui y dejan la bandera como estaba.
  if (res.status !== 502 && res.status !== 503 && res.status !== 504) {
    marcarServidorLento(false);
  }
  // 502/503/504 los pone el proxy de Render cuando el servidor esta caido o
  // despertando: no hubo respuesta de la aplicacion, es lo mismo que no tener red.
  // Tratarlos como rechazo decia "marca rechazada" a una lista que solo espera subir.
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new OfflineError('Servidor no disponible');
  }

  if (res.status === 401 && retry && session?.refreshToken) {
    const renewed = await refresh(session.refreshToken);
    if (renewed) return request<T>(path, init, false);
    clearSession();
    throw new Error('Sesion expirada');
  }
  if (!res.ok) {
    // El backend manda el motivo en `detail` (ProblemDetail) cuando lo hay, por
    // ejemplo un choque de horario: sin esto la interfaz solo podria decir
    // "Error 409" y quien edita no sabria con que choca.
    let detail: string | undefined;
    try { detail = ((await res.json()) as { detail?: string }).detail; } catch { /* sin cuerpo JSON */ }
    throw new HttpError(detail ?? `Error ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function refresh(refreshToken: string): Promise<boolean> {
  const res = await fetch(apiUrl('/api/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  setSession((await res.json()) as Session);
  return true;
}

/** Rutas que nunca se sirven de respaldo: ver el comentario de `get`. */
const SIN_RESPALDO = ['/api/attendance?', '/api/attendance/detalle'];

export const api = {
  async login(email: string, password: string): Promise<Session> {
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      const r = await entrarSinRed(email, password).catch(() => 'sin-credencial' as const);
      if (typeof r === 'object') {
        setSession(r);
        return r;
      }
      if (r === 'incorrecta') throw new Error('Correo o contrasena incorrectos');
      throw new Error('Sin conexion: la primera vez en este equipo se necesita internet para iniciar sesion');
    }

    if (!res.ok) throw new Error('Correo o contrasena incorrectos');
    const session = (await res.json()) as Session;
    setSession(session);
    void guardarCredencial(email, password, session).catch(() => {});
    return session;
  },
  /**
   * GET con respaldo local: si el servidor no se alcanza, devuelve la ultima
   * respuesta buena de esa misma ruta en vez de dejar la pantalla en blanco.
   *
   * SIN_RESPALDO son las rutas de las que depende una decision, no una consulta:
   * /api/attendance dice que hay ya registrado para un bloque, y TomarAsistencia lo
   * usa para avisar "puede que no vea todo lo que hay guardado". Servir eso de cache
   * mataria el aviso y el docente podria sobrescribir la asistencia de otro sin
   * enterarse. Ahi es mejor fallar que responder algo viejo.
   */
  get: async <T>(path: string): Promise<T> => {
    const conRespaldo = !SIN_RESPALDO.some((r) => path.startsWith(r));
    try {
      const datos = await request<T>(path, { method: 'GET' });
      // Solo se guarda lo que el servidor confirmo: nunca se cachea un error.
      // El .catch() no sobra: si IndexedDB no esta disponible (modo privado, o un
      // navegador con el almacenamiento bloqueado), guardar el respaldo falla y esa
      // promesa suelta se convertiria en un rechazo no capturado. Guardar la copia es
      // una comodidad; nunca puede afectar a la peticion que sí funciono.
      if (conRespaldo) void guardarLectura(path, datos, getSession()?.userId).catch(() => {});
      return datos;
    } catch (e) {
      if (!conRespaldo || !(e instanceof OfflineError)) throw e;
      const guardado = await ultimaLectura<T>(path, getSession()?.userId).catch(() => null);
      if (!guardado) throw e;   // sin respaldo, la pantalla debe decir que no hay datos
      return guardado.datos;
    }
  },
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  async cambiar<T>(
    metodo: CambioPendiente['metodo'], ruta: string, cuerpo: unknown, descripcion: string,
  ): Promise<{ encolado: false; datos: T } | { encolado: true }> {
    try {
      const datos = await request<T>(ruta, {
        method: metodo,
        ...(metodo === 'DELETE' ? {} : { body: JSON.stringify(cuerpo) }),
      });
      return { encolado: false, datos };
    } catch (e) {
      if (!(e instanceof OfflineError)) throw e;
      await db.cambios.add({
        id: crypto.randomUUID(), metodo, ruta, cuerpo, descripcion,
        creadoEn: new Date().toISOString(),
      });
      window.dispatchEvent(new Event('cola-cambio'));
      return { encolado: true };
    }
  },
};
