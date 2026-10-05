import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { db } from '../db/local';
import { descartarCambio, flushCambios } from './engine';

describe('cola de cambios administrativos', () => {
  beforeEach(async () => {
    await db.cambios.clear();
    vi.unstubAllGlobals();
  });

  it('sin red api.cambiar guarda el cambio localmente', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));

    await expect(api.cambiar('POST', '/api/admin/users', { email: 'ana@ggm.edu.co' }, 'Crear Ana'))
      .resolves.toEqual({ encolado: true });
    expect(await db.cambios.toArray()).toMatchObject([
      { metodo: 'POST', ruta: '/api/admin/users', descripcion: 'Crear Ana' },
    ]);
  });

  it('flush aplica los cambios por fecha y borra los confirmados', async () => {
    await db.cambios.bulkPut([
      { id: 'segundo', metodo: 'PUT', ruta: '/dos', cuerpo: { n: 2 }, descripcion: 'Dos', creadoEn: '2026-07-13T12:01:00Z' },
      { id: 'primero', metodo: 'POST', ruta: '/uno', cuerpo: { n: 1 }, descripcion: 'Uno', creadoEn: '2026-07-13T12:00:00Z' },
    ]);
    const rutas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      rutas.push(new URL(url, 'http://x').pathname);
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await expect(flushCambios()).resolves.toMatchObject({ sent: 2, pending: 0 });
    expect(rutas).toEqual(['/uno', '/dos']);
    expect(await db.cambios.count()).toBe(0);
  });

  it('un conflicto conserva su error y deja avanzar el cambio siguiente', async () => {
    await db.cambios.bulkPut([
      { id: 'conflicto', metodo: 'PUT', ruta: '/conflicto', cuerpo: {}, descripcion: 'Conflicto', creadoEn: '2026-07-13T12:00:00Z' },
      { id: 'bueno', metodo: 'DELETE', ruta: '/bueno', descripcion: 'Bueno', creadoEn: '2026-07-13T12:01:00Z' },
    ]);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('conflicto')
      ? new Response(JSON.stringify({ detail: 'Ya fue modificado' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
      : new Response(null, { status: 204 })));

    await expect(flushCambios()).resolves.toMatchObject({ sent: 1, pending: 1, conError: 1 });
    expect((await db.cambios.get('conflicto'))?.error).toBe('Ya fue modificado');
    expect(await db.cambios.get('bueno')).toBeUndefined();
  });

  it('descartar elimina un cambio pendiente', async () => {
    await db.cambios.add({ id: 'x', metodo: 'DELETE', ruta: '/x', descripcion: 'Eliminar', creadoEn: new Date().toISOString() });
    await descartarCambio('x');
    expect(await db.cambios.get('x')).toBeUndefined();
  });
});
