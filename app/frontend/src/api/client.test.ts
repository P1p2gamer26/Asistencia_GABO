import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiUrl, getSession, clearSession, OfflineError, HttpError, TOPE_PETICION_MS, UMBRAL_LENTO_MS, servidorLento } from './client';
import { guardarCredencial } from './credencialLocal';

describe('cliente http', () => {
  beforeEach(() => {
    localStorage.clear();
    clearSession();
  });

  it('una peticion colgada se corta y cuenta como sin conexion', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_, rechazar) => {
        init?.signal?.addEventListener('abort', () => rechazar(new DOMException('abort', 'AbortError')));
      })));
      const peticion = api.get('/api/x');
      const esperado = expect(peticion).rejects.toBeInstanceOf(OfflineError);
      await vi.advanceTimersByTimeAsync(TOPE_PETICION_MS + 1);
      await esperado;
    } finally {
      vi.useRealTimers();
    }
  });

  it('mientras el servidor arranca no dice sin conexion antes del tope de 200 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(TOPE_PETICION_MS).toBeGreaterThanOrEqual(200_000);
      vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((resolver, rechazar) => {
        init?.signal?.addEventListener('abort', () => rechazar(new DOMException('abort', 'AbortError')));
        setTimeout(() => resolver(new Response('{"ok":true}', { status: 200 })), 190_000);
      })));
      const peticion = api.get('/api/arranque');
      await vi.advanceTimersByTimeAsync(190_001);
      await expect(peticion).resolves.toEqual({ ok: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('un 502/503/504 del proxy cuenta como sin conexion, no como rechazo', async () => {
    for (const status of [502, 503, 504]) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })));
      await expect(api.get('/api/x')).rejects.toBeInstanceOf(OfflineError);
    }
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

describe('servidor lento', () => {
  beforeEach(() => {
    localStorage.clear();
    clearSession();
  });

  function okJson() {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // La bandera es estado de modulo: cada prueba arranca apagandola con una respuesta
  // 200 para no arrastrar el true que dejan la prueba del tope y la del 502.
  async function apagarBandera() {
    vi.stubGlobal('fetch', vi.fn(async () => okJson()));
    await api.post('/api/x', {});
    expect(servidorLento()).toBe(false);
  }

  // fetch que no responde hasta que el test le entrega la respuesta a mano.
  function fetchQueEspera() {
    let resolver!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((res) => { resolver = res; })));
    return (r: Response) => resolver(r);
  }

  it('esta en false a los 7999 ms, en true a los 8000 ms y un 200 la vuelve a false', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await apagarBandera();
      const responder = fetchQueEspera();
      const peticion = api.post('/api/x', {});

      await vi.advanceTimersByTimeAsync(UMBRAL_LENTO_MS - 1);
      expect(servidorLento()).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(servidorLento()).toBe(true);

      responder(okJson());
      await peticion;
      expect(servidorLento()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('una peticion que termina por el tope deja la bandera en true; un 200 posterior la apaga', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await apagarBandera();
      vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_, rechazar) => {
        init?.signal?.addEventListener('abort', () => rechazar(new DOMException('abort', 'AbortError')));
      })));
      const peticion = api.post('/api/x', {});
      const esperado = expect(peticion).rejects.toBeInstanceOf(OfflineError);
      await vi.advanceTimersByTimeAsync(TOPE_PETICION_MS + 1);
      await esperado;
      expect(servidorLento()).toBe(true);

      await apagarBandera();
    } finally {
      vi.useRealTimers();
    }
  });

  it('un 502 en una peticion lenta deja la bandera en true', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await apagarBandera();
      const responder = fetchQueEspera();
      const peticion = api.post('/api/x', {});
      const esperado = expect(peticion).rejects.toBeInstanceOf(OfflineError);

      await vi.advanceTimersByTimeAsync(UMBRAL_LENTO_MS);
      expect(servidorLento()).toBe(true);

      responder(new Response('', { status: 502 }));
      await esperado;
      expect(servidorLento()).toBe(true);

      await apagarBandera();
    } finally {
      vi.useRealTimers();
    }
  });

  it('una respuesta 400 o 401 (el servidor contesto) apaga la bandera aunque haya tardado', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      for (const status of [400, 401]) {
        await apagarBandera();
        const responder = fetchQueEspera();
        const peticion = api.post('/api/x', {});
        const esperado = expect(peticion).rejects.toBeInstanceOf(HttpError);

        await vi.advanceTimersByTimeAsync(UMBRAL_LENTO_MS);
        expect(servidorLento()).toBe(true);

        responder(new Response(JSON.stringify({ detail: 'x' }), {
          status, headers: { 'Content-Type': 'application/json' },
        }));
        await esperado;
        expect(servidorLento()).toBe(false);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('una respuesta a los 100 ms nunca emite servidor-lento', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await apagarBandera();
      let emisiones = 0;
      const contar = () => { emisiones += 1; };
      window.addEventListener('servidor-lento', contar);

      const responder = fetchQueEspera();
      const peticion = api.post('/api/x', {});
      await vi.advanceTimersByTimeAsync(100);
      responder(okJson());
      await peticion;

      window.removeEventListener('servidor-lento', contar);
      expect(emisiones).toBe(0);
      expect(servidorLento()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('login offline', () => {
  beforeEach(async () => {
    localStorage.clear();
    clearSession();
    await import('../db/local').then(({ db }) => db.meta.clear());
  });

  it('con fetch que lanza TypeError y credencial guardada, devuelve la session y la deja en localStorage', async () => {
    const session = { token: 't', refreshToken: 'r', role: 'DOCENTE', fullName: 'Fran', userId: 3, mustChangePassword: false };
    await guardarCredencial('fpalacios@ggm.edu.co', 'cambiar123', session, 1000);

    vi.stubGlobal('fetch', vi.fn(() => { throw new TypeError('Failed to fetch'); }));

    const result = await api.login('fpalacios@ggm.edu.co', 'cambiar123');

    expect(result.userId).toBe(3);
    expect(getSession()?.userId).toBe(3);
    expect(localStorage.getItem('ggm.session')).toContain('"userId":3');
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
