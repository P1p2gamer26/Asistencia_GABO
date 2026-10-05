import { useEffect, useState } from 'react';
import { db, type CambioPendiente } from '../db/local';
import { descartarCambio, reintentarCambio } from '../sync/engine';

export default function CambiosPendientes() {
  const [cambios, setCambios] = useState<CambioPendiente[]>([]);

  useEffect(() => {
    const cargar = () => void db.cambios.orderBy('creadoEn').toArray().then(setCambios);
    cargar();
    window.addEventListener('cola-cambio', cargar);
    window.addEventListener('datos-descargados', cargar);
    return () => {
      window.removeEventListener('cola-cambio', cargar);
      window.removeEventListener('datos-descargados', cargar);
    };
  }, []);

  // Lo que espera conexion se aplica solo y no necesita aviso. Solo se muestra lo que el
  // servidor rechazo: eso si hay que decidirlo, o se perderia sin que nadie se entere.
  const rechazados = cambios.filter((c) => c.error);
  if (rechazados.length === 0) return null;
  return (
    <section className="cambios-pendientes" aria-label="Cambios sin aplicar">
      <h2>Cambios que el servidor no acepto</h2>
      <ul>
        {rechazados.map((cambio) => (
          <li key={cambio.id}>
            <span>{cambio.descripcion}</span>{' '}
            {cambio.error
              ? <><span className="error-texto">{cambio.error}</span>{' '}<button type="button" className="secundario chico" onClick={() => void reintentarCambio(cambio.id)}>Reintentar</button>{' '}<button type="button" className="secundario chico" onClick={() => void descartarCambio(cambio.id)}>Descartar</button></>
              : <span>esperando conexion</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
