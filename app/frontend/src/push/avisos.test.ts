import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activarAvisos, CLAVE_PREGUNTA, estado, pedirPermisoAlEntrar, yaPregunto } from './avisos';

// Simula un navegador de escritorio con notificaciones y service worker.
function navegador(permiso: NotificationPermission) {
  const requestPermission = vi.fn(async () => {
    (window as unknown as { Notification: { permission: string } }).Notification.permission = 'granted';
    return 'granted' as NotificationPermission;
  });
  class FakeNotification {
    static permission: NotificationPermission = permiso;
    static requestPermission = requestPermission;
  }
  vi.stubGlobal('Notification', FakeNotification);
  vi.stubGlobal('PushManager', class {});
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => null } }) },
    configurable: true,
  });
  return requestPermission;
}

describe('avisos de toma de lista', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (X11; Linux x86_64)', configurable: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('sin toque no pide el permiso', () => {
    const pedir = navegador('default');
    expect(estado()).toBe('pendiente');
    expect(pedir).not.toHaveBeenCalled();
  });

  it('con un toque pide el permiso una sola vez, aunque se toque otra vez', async () => {
    const pedir = navegador('default');
    await activarAvisos();
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(CLAVE_PREGUNTA)).toBe('1');
    expect(yaPregunto()).toBe(true);
    await activarAvisos();
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('al entrar pide el permiso una sola vez; si ya se pregunto no vuelve a pedir', () => {
    const pedir = navegador('default');
    expect(pedirPermisoAlEntrar()).not.toBeNull();
    expect(pedirPermisoAlEntrar()).toBeNull();
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('si el permiso quedo sin decidir, el boton manual vuelve a pedirlo', async () => {
    const pedir = navegador('default');
    localStorage.setItem(CLAVE_PREGUNTA, '1');
    await activarAvisos();
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('en iPhone sin instalar devuelve instrucciones, no intenta pedir permiso', () => {
    navegador('default');
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', configurable: true,
    });
    expect(estado()).toBe('ios-sin-instalar');
  });

  it('sin soporte de notificaciones no falla', () => {
    vi.stubGlobal('Notification', undefined);
    expect(estado()).toBe('no-soportado');
  });
});
