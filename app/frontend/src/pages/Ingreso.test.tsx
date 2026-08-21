import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { db } from '../db/local';
import Ingreso from './Ingreso';

// La camara no existe en jsdom: se simula el modulo de escaneo entero.
const siguienteCodigo = vi.hoisted(() => ({ valor: '' }));
vi.mock('../scan/scanner', () => ({
  abrirCamara: vi.fn(async () => ({ getTracks: () => [] }) as unknown as MediaStream),
  scanOnce: vi.fn(async () => {
    if (!siguienteCodigo.valor) await new Promise(() => {});   // se queda esperando
    const v = siguienteCodigo.valor;
    siguienteCodigo.valor = '';
    return v;
  }),
}));
vi.mock('../api/client', () => ({
  api: { post: vi.fn(async () => ({ accepted: 1, rejected: [] })) },
  OfflineError: class extends Error {},
}));

beforeEach(async () => {
  await db.students.clear();
  await db.entryOutbox.clear();
  await db.students.put({ id: 1, documentId: '1013696566', fullName: 'Alvaro Orozco Lara', grade: '103' });
});

describe('Ingreso', () => {
  it('encola el documento extraido del carnet, no el texto completo', async () => {
    siguienteCodigo.valor = 'Alvaro Mathias Orozco Lara 1013696566 Primero - 103';
    render(<Ingreso />);
    await waitFor(async () =>
      expect((await db.entryOutbox.toArray())[0]?.documentId).toBe('1013696566'));
  });

  it('muestra el nombre que tiene la base de datos', async () => {
    siguienteCodigo.valor = 'Alvaro Mathias Orozco Lara 1013696566 Primero - 103';
    render(<Ingreso />);
    expect(await screen.findByText(/Alvaro Orozco Lara/)).toBeInTheDocument();
  });

  it('avisa si el curso del carnet no coincide con el de la base', async () => {
    siguienteCodigo.valor = 'Alvaro Mathias Orozco Lara 1013696566 Segundo - 204';
    render(<Ingreso />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/carnet dice.*204.*base.*103/i);
  });

  it('avisa cuando el QR no trae ningun documento', async () => {
    siguienteCodigo.valor = 'carnet borroso';
    render(<Ingreso />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo leer/i);
    expect(await db.entryOutbox.count()).toBe(0);
  });
});
