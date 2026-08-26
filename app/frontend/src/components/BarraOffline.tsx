import { useEffect, useState } from 'react';
import { estadoDeDatos } from '../sync/engine';
import { useSincronizacion } from '../sync/useSincronizacion';

/**
 * Franja fija de estado. Solo aparece cuando hay algo que decir: en el caso normal
 * (todo enviado, servidor alcanzable y copia local reciente) no ocupa un pixel.
 */
export default function BarraOffline() {
  const { pendientes, alcanzable, sincronizarAhora } = useSincronizacion();
  const [datos, setDatos] = useState<{ dias: number | null; estudiantes: number } | null>(null);

  useEffect(() => {
    void estadoDeDatos().then((e) => setDatos({ dias: e.dias, estudiantes: e.estudiantes }));
  }, [pendientes]);

  // Sin copia local no se puede tomar lista: es mas grave que tener cola pendiente.
  const sinDatos = datos !== null && datos.estudiantes === 0;
  const datosViejos = datos !== null && datos.dias !== null && datos.dias >= 7;

  if (pendientes === 0 && alcanzable && !sinDatos && !datosViejos) return null;

  const mensaje = sinDatos
    ? 'No hay datos descargados en este telefono: conectese una vez para poder tomar lista sin señal.'
    : datosViejos
      ? `Los datos del colegio se descargaron hace ${datos!.dias} dias. Conectese para actualizarlos.`
      : alcanzable
        ? `Enviando ${pendientes} marca${pendientes === 1 ? '' : 's'}...`
        : `Sin conexion. ${pendientes} marca${pendientes === 1 ? '' : 's'} guardada${pendientes === 1 ? '' : 's'} en el telefono.`;

  return (
    <div className={`barra-offline ${alcanzable && !sinDatos ? '' : 'sin-red'}`} role="status">
      <span>{mensaje}</span>
      <button type="button" className="secundario" onClick={() => void sincronizarAhora()}>
        Reintentar
      </button>
    </div>
  );
}
