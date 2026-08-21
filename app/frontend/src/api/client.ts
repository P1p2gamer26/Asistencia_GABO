import type { Session } from './contract';
export type { Session };

const KEY = 'ggm.session';

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
    res = await fetch(path, {
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
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return (await res.json()) as T;
}

async function refresh(refreshToken: string): Promise<boolean> {
  const res = await fetch('/api/auth/refresh', {
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
    const res = await fetch('/api/auth/login', {
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
};
