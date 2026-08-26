import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/local';

// La camara no existe en jsdom: se sustituye el modulo entero.
const escaneos: string[] = [];
vi.mock('../scan/scanner', () => ({
  abrirCamara: vi.fn(async () => ({ getTracks: () => [] })),
  scanOnce: vi.fn(async () => {
    const v = escaneos.shift();
    if (v === undefined) await new Promise(() => {});   // no vuelve a escanear
    return v;
  }),
  tieneLinterna: vi.fn(() => false),
  alternarLinterna: vi.fn(async () => {}),
}));

import Ingreso from './Ingreso';

function respuesta(datos: unknown) {
  return new Response(JSON.stringify(datos),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Ingreso', () => {
  beforeEach(async () => {
    escaneos.length = 0;
    await db.entryOutbox.clear();
    await db.students.clear();
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'COORDINADOR',
      fullName: 'Coordinacion', userId: 2, mustChangePassword: false,
    }));
  });

  it('muestra el nombre que devuelve el servidor, aunque no este en la copia local', async () => {
    // El caso de la porteria: coordinacion no dicta cursos, asi que su copia local
    // esta vacia y antes decia "no reconocido" a todos los estudiantes del colegio.
    escaneos.push('1000000500');
    // El servidor responde con el nombre asociado al id real que se le envio
    // (crypto.randomUUID no es predecible, asi que el mock lo lee del cuerpo).
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const { entries } = JSON.parse(init.body as string);
      return respuesta({
        accepted: 1, rejected: [],
        names: { [entries[0].id]: 'NOMBRE500 APELLIDO500' },
      });
    }));

    render(<Ingreso />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/NOMBRE500 APELLIDO500/));
  });

  it('un carnet que el servidor rechaza se avisa como no registrado', async () => {
    escaneos.push('0000000000');
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const { entries } = JSON.parse(init.body as string);
      return respuesta({
        accepted: 0,
        rejected: [{ id: entries[0].id, reason: 'Carnet no registrado' }],
        names: {},
      });
    }));

    render(<Ingreso />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no registrado/i));
  });

  it('sin conexion dice que quedo guardado, no que no se reconoce', async () => {
    escaneos.push('1000000500');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));

    render(<Ingreso />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/se verificara al sincronizar/i));
    // Y el ingreso queda en la cola: decir lo contrario haria que lo escanearan tres veces.
    await waitFor(async () => expect(await db.entryOutbox.count()).toBe(1));
  });

  it('sin conexion, si el estudiante esta en la copia local, muestra su nombre', async () => {
    await db.students.put({ id: 7, documentId: '1010101010',
                            fullName: 'LINDA AREVALO', grade: '601' });
    escaneos.push('1010101010');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));

    render(<Ingreso />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/LINDA AREVALO/));
  });

  it('cuenta los ingresos que quedan sin enviar', async () => {
    escaneos.push('1000000500');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));

    render(<Ingreso />);
    await waitFor(() => expect(screen.getByText(/1 ingreso/i)).toBeInTheDocument());
  });
});
