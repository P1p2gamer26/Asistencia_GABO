import type { Session } from './contract';
export type { Session };

const KEY = 'ggm.session';

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

async function request<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const session = getSession();
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new OfflineError('Sin conexion');
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
    throw new Error(detail ?? `Error ${res.status}`);
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

export const api = {
  async login(email: string, password: string): Promise<Session> {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Correo o contrasena incorrectos');
    const session = (await res.json()) as Session;
    setSession(session);
    return session;
  },
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
