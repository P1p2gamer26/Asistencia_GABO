import { useCallback, useEffect, useState } from 'react';
import { flushAll, pendingCount, startAutoSync } from './engine';

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
  const [conError, setConError] = useState(0);

  useEffect(() => {
    // Snapshot inmediato del conteo; el auto-sync recien montado lo lleva al estado
    // real (incluido si el servidor rechazo marcas) con su primer intento.
    void pendingCount().then(setPendientes);
    return startAutoSync((p, a, c) => { setPendientes(p); setAlcanzable(a); setConError(c); });
  }, []);

  const sincronizarAhora = useCallback(async () => {
    const r = await flushAll().catch(() => null);
    if (!r) return;
    setPendientes(r.pending);
    setAlcanzable(r.alcanzable);
    setConError(r.conError);
  }, []);

  return { pendientes, alcanzable, conError, sincronizarAhora };
}
