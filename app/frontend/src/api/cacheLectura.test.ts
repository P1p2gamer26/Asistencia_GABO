import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/local';
import { guardarLectura, ultimaLectura } from './cacheLectura';
import { api, OfflineError } from './client';

describe('cache de lecturas', () => {
  beforeEach(async () => { await db.meta.clear(); });

  it('devuelve lo ultimo que respondio bien el servidor', async () => {
    await guardarLectura('/api/reports/today', { mesAsistencia: 99 });
    const guardado = await ultimaLectura<{ mesAsistencia: number }>('/api/reports/today');
    expect(guardado?.datos.mesAsistencia).toBe(99);
    expect(guardado?.cuando).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('una ruta que nunca respondio no inventa datos', async () => {
    expect(await ultimaLectura('/api/reports/novedades')).toBeNull();
  });

  it('cada ruta se guarda por separado', async () => {
    await guardarLectura('/api/a', { v: 1 });
    await guardarLectura('/api/b', { v: 2 });
    expect((await ultimaLectura<{ v: number }>('/api/a'))?.datos.v).toBe(1);
    expect((await ultimaLectura<{ v: number }>('/api/b'))?.datos.v).toBe(2);
  });
});

describe('api.get con respaldo local', () => {
  beforeEach(async () => {
    await db.meta.clear();
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ADMIN', fullName: 'A', userId: 1,
      mustChangePassword: false,
    }));
  });

  it('sin red devuelve lo ultimo bueno en vez de reventar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ v: 7 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));
    expect(await api.get<{ v: number }>('/api/reports/today')).toEqual({ v: 7 });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    expect(await api.get<{ v: number }>('/api/reports/today')).toEqual({ v: 7 });
  });

  it('sin red y sin nada guardado sigue lanzando OfflineError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await expect(api.get('/api/reports/nunca-pedido')).rejects.toBeInstanceOf(OfflineError);
  });

  it('la comprobacion de lo ya registrado en tomar asistencia no usa respaldo', async () => {
    // Esta ruta alimenta el aviso de TomarAsistencia.tsx: si se sirviera de cache,
    // el aviso "Sin conexion no se puede comprobar..." dejaria de aparecer y el
    // docente podria sobrescribir asistencia sin saberlo.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ studentId: 1, status: 'P' }]),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await api.get('/api/attendance?blockId=7&date=2026-08-26');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await expect(api.get('/api/attendance?blockId=7&date=2026-08-26')).rejects.toBeInstanceOf(OfflineError);
  });
});
