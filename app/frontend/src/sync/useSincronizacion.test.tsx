import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/local';
import { useSincronizacion } from './useSincronizacion';

function Sonda() {
  const { pendientes, alcanzable } = useSincronizacion();
  return <p>pendientes={pendientes} alcanzable={String(alcanzable)}</p>;
}

describe('useSincronizacion', () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.schoolDays.clear();
    await db.schoolDays.bulkPut([{ calendarDate: '2026-07-13', dayType: 'LECTIVO' }]);
    vi.unstubAllGlobals();
  });

  it('cuenta lo que hay pendiente en la cola al montarse', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await db.outbox.put({
      key: '1:7:2026-07-13', id: 'u1', studentId: 1, scheduleBlockId: 7,
      classDate: '2026-07-13', status: 'P', recordedAt: '2026-07-13T12:00:00Z',
    });

    render(<Sonda />);
    await waitFor(() => expect(screen.getByText(/pendientes=1/)).toBeInTheDocument());
    expect(screen.getByText(/alcanzable=false/)).toBeInTheDocument();
  });

  it('cuando el servidor responde, vacia la cola sin que nadie pulse nada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ accepted: 1, rejected: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await db.outbox.put({
      key: '1:7:2026-07-13', id: 'u1', studentId: 1, scheduleBlockId: 7,
      classDate: '2026-07-13', status: 'P', recordedAt: '2026-07-13T12:00:00Z',
    });

    render(<Sonda />);
    await waitFor(() => expect(screen.getByText(/pendientes=0/)).toBeInTheDocument());
    expect(await db.outbox.count()).toBe(0);
  });
});
