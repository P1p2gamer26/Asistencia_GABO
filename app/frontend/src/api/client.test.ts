import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiUrl, getSession, clearSession } from './client';

describe('cliente http', () => {
  beforeEach(() => {
    localStorage.clear();
    clearSession();
  });

  it('guarda la sesion tras un login correcto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ token: 't', refreshToken: 'r', role: 'DOCENTE', fullName: 'Fran', userId: 3 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await api.login('fpalacios@ggm.edu.co', 'cambiar123');

    expect(getSession()?.role).toBe('DOCENTE');
    expect(getSession()?.token).toBe('t');
  });

  it('ante un 401 renueva el token una vez y reintenta la peticion', async () => {
    localStorage.setItem('ggm.session', JSON.stringify(
      { token: 'viejo', refreshToken: 'r', role: 'DOCENTE', fullName: 'Fran', userId: 3 }));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ token: 'nuevo', refreshToken: 'r2', role: 'DOCENTE', fullName: 'Fran', userId: 3 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await api.get<{ ok: boolean }>('/api/sync/bootstrap');

    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getSession()?.token).toBe('nuevo');
  });
});

describe('apiUrl', () => {
  it('sin VITE_API_URL deja la ruta relativa (backend en el mismo origen)', () => {
    expect(apiUrl('/api/auth/login')).toBe('/api/auth/login');
  });

  it('ningun modulo llama a fetch con /api sin pasar por apiUrl', () => {
    // En Vercel el frontend y la API viven en dominios distintos: una ruta relativa
    // apuntaria a Vercel y fallaria en produccion, no aqui.
    const fuentes = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
    const culpables = Object.entries(fuentes)
      .filter(([f]) => !f.includes('.test.') && !f.endsWith('/api/client.ts'))
      .filter(([, src]) => /fetch\(\s*[`'"]\/api\//.test(src as string))
      .map(([f]) => f);
    expect(culpables).toEqual([]);
  });
});
