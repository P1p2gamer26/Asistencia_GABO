import { useSincronizacion } from '../sync/useSincronizacion';

/**
 * Franja fija de estado. Solo aparece cuando hay algo que decir: en el caso normal
 * (todo enviado y servidor alcanzable) no ocupa un pixel.
 */
export default function BarraOffline() {
  const { pendientes, alcanzable, sincronizarAhora } = useSincronizacion();
  if (pendientes === 0 && alcanzable) return null;

  return (
    <div className={`barra-offline ${alcanzable ? '' : 'sin-red'}`} role="status">
      <span>
        {alcanzable
          ? `Enviando ${pendientes} marca${pendientes === 1 ? '' : 's'}...`
          : `Sin conexion. ${pendientes} marca${pendientes === 1 ? '' : 's'} guardada${pendientes === 1 ? '' : 's'} en el telefono.`}
      </span>
      <button type="button" className="secundario" onClick={() => void sincronizarAhora()}>
        Reintentar
      </button>
    </div>
  );
}
