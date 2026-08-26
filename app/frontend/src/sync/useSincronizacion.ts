import { useCallback, useEffect, useState } from 'react';
import { flushOutbox, pendingCount, startAutoSync } from './engine';

/**
 * Sincronizacion viva en toda la aplicacion.
 *
 * Antes esto se montaba solo dentro de la pantalla de asistencia: el docente marcaba
 * la lista, se iba a otra pantalla y la cola se quedaba en el telefono hasta que
 * volviera a entrar justo ahi. Los datos nunca se perdian, pero podian tardar dias
 * en llegar al colegio, que para una planilla de asistencia es casi lo mismo.
 */
export function useSincronizacion() {
  const [pendientes, setPendientes] = useState(0);
  const [alcanzable, setAlcanzable] = useState(true);

  useEffect(() => {
    void pendingCount().then(setPendientes);
    return startAutoSync((p, a) => { setPendientes(p); setAlcanzable(a); });
  }, []);

  const sincronizarAhora = useCallback(async () => {
    const r = await flushOutbox().catch(() => null);
    if (!r) return;
    setPendientes(r.pending);
    setAlcanzable(r.alcanzable);
  }, []);

  return { pendientes, alcanzable, sincronizarAhora };
}
