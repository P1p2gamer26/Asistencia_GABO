// stub de Fase 0 — Track B lo reemplaza en la Task B1
import type { Session } from './contract';

const KEY = 'ggm.session';

export function getSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
