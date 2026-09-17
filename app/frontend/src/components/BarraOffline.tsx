import { useEffect, useState } from 'react';
import { estadoDeDatos } from '../sync/engine';
import { useSincronizacion } from '../sync/useSincronizacion';
import { getSession } from '../api/client';

/**
 * Franja fija de estado, SIEMPRE visible.
 *
 * Antes solo aparecia cuando algo iba mal, y eso deja al docente adivinando: al no ver
 * nada no sabe si esta subiendo, si ya subio o si el telefono se quedo sin señal en
 * mitad de la jornada. Un indicador que solo habla de los problemas no sirve para
 * confiar; lo que hace falta es saber en que modo se esta trabajando, siempre.
 */
export default function BarraOffline() {
  const { pendientes, alcanzable, conError, sincronizarAhora } = useSincronizacion();
  const [datos, setDatos] = useState<{ dias: number | null; estudiantes: number } | null>(null);

  useEffect(() => {
    const consultar = () => {
      void estadoDeDatos().then((e) => setDatos({ dias: e.dias, estudiantes: e.estudiantes }));
    };
    consultar();
    // pendientes==0 y alcanzable==true no cambian cuando la cola ya esta vacia (flush
    // corta antes de tocar la red), asi que una descarga exitosa sin marcar nada no
    // dispara este efecto por si sola. Se vuelve a consultar al desbloquear el
    // telefono, que es cuando Menu ya tuvo ocasion de llamar downloadBootstrap.
    document.addEventListener('visibilitychange', consultar);
    return () => document.removeEventListener('visibilitychange', consultar);
  }, [pendientes]);

  // Sin copia local no se puede tomar lista: es mas grave que tener cola pendiente.
  // El acudiente no toma lista ni descarga el catalogo: para el no falta nada.
  const tomaLista = getSession()?.role !== 'ACUDIENTE';
  const sinDatos = tomaLista && datos !== null && datos.estudiantes === 0;
  const datosViejos = datos !== null && datos.dias !== null && datos.dias >= 7;

  const marcas = (n: number) => `${n} marca${n === 1 ? '' : 's'}`;

  // El orden es el de la gravedad: lo que impide trabajar va antes que lo que solo
  // retrasa el envio.
  const { modo, mensaje } = !alcanzable
    ? {
        modo: 'sin-red',
        mensaje: pendientes > 0
          ? `Sin internet · ${marcas(pendientes)} guardada${pendientes === 1 ? '' : 's'} aqui, suben solas al reconectar`
          : 'Sin internet · puede seguir tomando lista, se guarda en este dispositivo',
      }
    : sinDatos
      ? {
          modo: 'sin-red',
          mensaje: 'En linea · faltan los datos del colegio, espere a que terminen de bajar',
        }
      : pendientes > 0
        // Con marcas rechazadas, prometer que estan "subiendo" seria mentira: el
        // servidor respondio que no las quiere aun. Se dice y se ofrece reintentar.
        ? conError > 0
          ? {
              modo: 'aviso',
              mensaje: `En linea · ${marcas(pendientes)} rechazada${pendientes === 1 ? '' : 's'} por el servidor, corregir o reintentar`,
            }
          : { modo: 'subiendo', mensaje: `En linea · subiendo ${marcas(pendientes)}...` }
        : datosViejos
          ? {
              modo: 'aviso',
              mensaje: `En linea · los datos del colegio son de hace ${datos!.dias} dias`,
            }
          : { modo: 'en-linea', mensaje: 'En linea · todo subido' };

  return (
    <div className={`barra-offline ${modo}`} role="status">
      <span className="punto" aria-hidden="true" />
      <span>{mensaje}</span>
      {(pendientes > 0 || !alcanzable || sinDatos || datosViejos) && (
        <button type="button" className="secundario" onClick={() => void sincronizarAhora()}>
          Reintentar
        </button>
      )}
    </div>
  );
}
