import { api } from '../api/client';

/** Marca local: el permiso de notificaciones se pide como mucho una vez en este navegador. */
export const CLAVE_PREGUNTA = 'avisos.pregunta.v1';

export type EstadoAvisos = 'no-soportado' | 'ios-sin-instalar' | 'denegado' | 'concedido' | 'pendiente';

export function esIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function instalada(): boolean {
  const modoApp = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return modoApp || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function soportado(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function yaPregunto(): boolean {
  try {
    return localStorage.getItem(CLAVE_PREGUNTA) === '1';
  } catch {
    return false; // sin almacenamiento no podemos recordar; el boton solo aparece con un toque
  }
}

function marcarPregunta() {
  try { localStorage.setItem(CLAVE_PREGUNTA, '1'); } catch { /* sin almacenamiento */ }
}

export function estado(): EstadoAvisos {
  // En iPhone/iPad, Safari en la pestana no tiene notificaciones web: hay que instalar la app.
  if (esIOS() && !instalada()) return 'ios-sin-instalar';
  if (!soportado()) return 'no-soportado';
  if (Notification.permission === 'granted') return 'concedido';
  if (Notification.permission === 'denied') return 'denegado';
  return 'pendiente';
}

function aBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Crea o recupera la suscripcion de este dispositivo y la guarda en el servidor. */
async function suscribir(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api.get<{ key: string }>('/api/push/vapid-public-key');
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(key) });
  const j = sub.toJSON();
  await api.post('/api/push/subscriptions', { endpoint: j.endpoint, keys: j.keys });
}

/** Sin pedir nada: si el permiso ya se concedio, deja la suscripcion al dia. */
export async function sincronizarSiConcedido(): Promise<void> {
  if (!soportado() || Notification.permission !== 'granted') return;
  try { await suscribir(); } catch { /* sin red o sin claves: se reintenta la proxima vez */ }
}

/**
 * Se llama en el clic de "Entrar", antes de cualquier await: el navegador solo muestra el
 * dialogo si la peticion nace de un gesto del usuario. Pide una sola vez automaticamente.
 * Devuelve null si ya se pregunto o si no hay nada que pedir.
 */
export function pedirPermisoAlEntrar(): Promise<NotificationPermission> | null {
  if (estado() !== 'pendiente' || yaPregunto()) return null;
  marcarPregunta();
  return Notification.requestPermission();
}

/**
 * Boton manual, para quien rechazo o cerro el aviso del navegador. Como el navegador solo
 * pregunta mientras el permiso siga "sin decidir", esto no sirve si ya quedo bloqueado.
 */
export async function activarAvisos(): Promise<EstadoAvisos> {
  if (estado() !== 'pendiente') return estado();
  marcarPregunta();
  const respuesta = await Notification.requestPermission();
  if (respuesta === 'granted') {
    try { await suscribir(); } catch { /* el permiso queda concedido; se sincroniza al abrir la app */ }
  }
  return estado();
}
