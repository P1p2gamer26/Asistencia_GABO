import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/local';
import { precalentarLecturas } from './engine';

describe('precalentarLecturas', () => {
  beforeEach(async () => {
    await db.meta.clear();
    vi.unstubAllGlobals();
  });

  it('pide las rutas de admin cuando el rol es ADMIN', async () => {
    const solicitadas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      solicitadas.push(new URL(url, 'http://x').pathname + new URL(url, 'http://x').search);
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await precalentarLecturas('ADMIN', new Date(2026, 0, 15));

    expect(solicitadas).toContain('/api/schedule/my-day');
    expect(solicitadas).toContain('/api/reports/pending-recent');
    expect(solicitadas).toContain('/api/schedule/week');
    expect(solicitadas).toContain('/api/attendance/recientes');
    expect(solicitadas).toContain('/api/entry/dia');
    expect(solicitadas).toContain('/api/calendar/school-days?from=2026-01-01&to=2026-01-31');
    expect(solicitadas).toContain('/api/reports/today');
    expect(solicitadas).toContain('/api/reports/novedades?dias=7&limite=5');
    expect(solicitadas).toContain('/api/schedule/grades');
    expect(solicitadas).toContain('/api/admin/users?role=DOCENTE');
    expect(solicitadas.some((r) => r.startsWith('/api/reports/dashboard?from=') && r.includes('to=2026-01-15'))).toBe(true);
  });

  it('no pide /api/reports/today cuando el rol es ACUDIENTE', async () => {
    const solicitadas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      solicitadas.push(new URL(url, 'http://x').pathname + new URL(url, 'http://x').search);
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await precalentarLecturas('ACUDIENTE', new Date(2026, 0, 15));

    expect(solicitadas).not.toContain('/api/reports/today');
    expect(solicitadas).not.toContain('/api/reports/novedades?dias=7&limite=5');
    expect(solicitadas).not.toContain('/api/schedule/grades');
    expect(solicitadas).not.toContain('/api/admin/users?role=DOCENTE');
    expect(solicitadas).toContain('/api/guardian/children');
  });

  it('pide las rutas comunes para DOCENTE', async () => {
    const solicitadas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      solicitadas.push(new URL(url, 'http://x').pathname + new URL(url, 'http://x').search);
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await precalentarLecturas('DOCENTE', new Date(2026, 0, 15));

    expect(solicitadas).toContain('/api/schedule/my-day');
    expect(solicitadas).toContain('/api/reports/pending-recent');
    expect(solicitadas).toContain('/api/schedule/week');
    expect(solicitadas).toContain('/api/attendance/recientes');
    expect(solicitadas).toContain('/api/entry/dia');
    expect(solicitadas).toContain('/api/calendar/school-days?from=2026-01-01&to=2026-01-31');
    expect(solicitadas).not.toContain('/api/reports/today');
    expect(solicitadas).not.toContain('/api/guardian/children');
  });

  it('ignora errores de red y no lanza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));

    await expect(precalentarLecturas('ADMIN', new Date(2026, 0, 15))).resolves.toBeUndefined();
  });
});