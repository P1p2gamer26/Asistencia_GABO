import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, getSession, clearSession } from './client';

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
