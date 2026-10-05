/*
 * Nunca se guarda la contraseña, solo una huella PBKDF2 con sal.
 * Vale 30 días desde la última entrada con internet (lo que dura el refresh token).
 */

import { db } from '../db/local';
import type { Session } from './contract';

const KEY_PREFIX = 'credencial:';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(str: string): Uint8Array<ArrayBuffer> {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function guardarCredencial(
  email: string,
  password: string,
  session: Session,
  iteraciones = 600_000
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveKey(password, salt, iteraciones);

  const payload = {
    sal: toBase64(salt),
    hash: toBase64(hash),
    iteraciones,
    session,
    verificadoEn: new Date().toISOString(),
  };

  await db.meta.put({ key: KEY_PREFIX + normalizeEmail(email), value: JSON.stringify(payload) });
}

export async function entrarSinRed(
  email: string,
  password: string
): Promise<Session | 'sin-credencial' | 'incorrecta'> {
  const key = KEY_PREFIX + normalizeEmail(email);
  const record = await db.meta.get(key);

  if (!record) return 'sin-credencial';

  let payload: {
    sal: string;
    hash: string;
    iteraciones: number;
    session: Session;
    verificadoEn: string;
  };

  try {
    payload = JSON.parse(record.value);
  } catch {
    return 'sin-credencial';
  }

  const verificadoEn = new Date(payload.verificadoEn).getTime();
  const ahora = Date.now();
  const TREINTA_DIAS = 30 * 24 * 60 * 60 * 1000;
  if (ahora - verificadoEn > TREINTA_DIAS) return 'sin-credencial';

  const salt = fromBase64(payload.sal);
  const expectedHash = fromBase64(payload.hash);
  const derived = await deriveKey(password, salt, payload.iteraciones);
  const derivedBytes = new Uint8Array(derived);

  if (!constantTimeEqual(derivedBytes, expectedHash)) return 'incorrecta';

  return payload.session;
}

export async function actualizarClaveLocal(userId: number, nueva: string): Promise<void> {
  try {
    const credenciales = await db.meta.where('key').startsWith(KEY_PREFIX).toArray();

    for (const record of credenciales) {
      let payload: {
        sal: string;
        hash: string;
        iteraciones: number;
        session: Session;
        verificadoEn: string;
      };

      try {
        payload = JSON.parse(record.value);
      } catch {
        continue;
      }

      if (payload.session.userId !== userId) continue;

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await deriveKey(nueva, salt, payload.iteraciones);

      payload.sal = toBase64(salt);
      payload.hash = toBase64(hash);
      payload.session.mustChangePassword = false;
      payload.verificadoEn = new Date().toISOString();

      await db.meta.put({ key: record.key, value: JSON.stringify(payload) });
      break;
    }
  } catch {
    // Fallo de IndexedDB: no rompemos el flujo
  }
}