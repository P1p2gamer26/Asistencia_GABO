import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../db/local';
import { guardarCredencial, entrarSinRed, actualizarClaveLocal } from './credencialLocal';
import type { Session } from './contract';

const MOCK_SESSION: Session = {
  token: 'test-token',
  refreshToken: 'test-refresh',
  role: 'DOCENTE',
  fullName: 'Test User',
  userId: 42,
  mustChangePassword: false,
};

async function setupCredencial(email: string, password: string, session: Session = MOCK_SESSION, iteraciones = 1000) {
  await guardarCredencial(email, password, session, iteraciones);
}

describe('credencialLocal', () => {
  beforeEach(async () => {
    await db.meta.clear();
  });

  it('guardar y entrar con la correcta devuelve la session', async () => {
    await setupCredencial('user@test.com', 'password123');
    const result = await entrarSinRed('user@test.com', 'password123');
    expect(result).not.toBe('sin-credencial');
    expect(result).not.toBe('incorrecta');
    expect((result as Session).userId).toBe(42);
  });

  it('con otra contrasena -> incorrecta', async () => {
    await setupCredencial('user@test.com', 'password123');
    const result = await entrarSinRed('user@test.com', 'wrongpassword');
    expect(result).toBe('incorrecta');
  });

  it('email desconocido -> sin-credencial', async () => {
    const result = await entrarSinRed('unknown@test.com', 'password123');
    expect(result).toBe('sin-credencial');
  });

  it('verificadoEn de hace 31 dias -> sin-credencial', async () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await db.meta.put({
      key: 'credencial:user@test.com',
      value: JSON.stringify({
        sal: 'dGVzdHNhbHQ=', // base64 de 'testsalt'
        hash: 'dGVzdGhhc2g=', // base64 de 'testhash'
        iteraciones: 1000,
        session: MOCK_SESSION,
        verificadoEn: oldDate,
      }),
    });
    const result = await entrarSinRed('user@test.com', 'password123');
    expect(result).toBe('sin-credencial');
  });

  it('el email se normaliza (mayusculas/espacios)', async () => {
    await setupCredencial('  USER@TEST.COM  ', 'password123');
    const result = await entrarSinRed('user@test.com', 'password123');
    expect(result).not.toBe('sin-credencial');
    expect((result as Session).userId).toBe(42);
  });

  it('actualizarClaveLocal actualiza la credencial y pone mustChangePassword=false', async () => {
    await setupCredencial('user@test.com', 'oldpassword', { ...MOCK_SESSION, mustChangePassword: true });
    await actualizarClaveLocal(42, 'newpassword');

    const result = await entrarSinRed('user@test.com', 'newpassword');
    expect(result).not.toBe('sin-credencial');
    expect(result).not.toBe('incorrecta');
    expect((result as Session).mustChangePassword).toBe(false);

    const oldResult = await entrarSinRed('user@test.com', 'oldpassword');
    expect(oldResult).toBe('incorrecta');
  });

  it('actualizarClaveLocal no rompe si falla IndexedDB', async () => {
    await setupCredencial('user@test.com', 'password123');
    await db.close();
    await expect(actualizarClaveLocal(42, 'newpassword')).resolves.not.toThrow();
    await db.open();
  });
});