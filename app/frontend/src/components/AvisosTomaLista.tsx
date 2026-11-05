import { useEffect, useState } from 'react';
import { activarAvisos, estado, EstadoAvisos, sincronizarSiConcedido } from '../push/avisos';

/** Ofrece los avisos de toma de lista una sola vez. Nunca pide el permiso sin un toque. */
export default function AvisosTomaLista() {
  const [est, setEst] = useState<EstadoAvisos | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void sincronizarSiConcedido();
    setEst(estado());
  }, []);

  async function activar() {
    setOcupado(true);
    setEst(await activarAvisos());
    setOcupado(false);
  }

  if (est === 'ios-sin-instalar') {
    return (
      <section className="aviso-push" aria-label="Avisos">
        <p>
          Para recibir avisos de clase en este iPhone: toca Compartir y luego
          "Agregar a pantalla de inicio", y abre la app desde ese icono.
        </p>
      </section>
    );
  }

  if (est === 'denegado') {
    return (
      <section className="aviso-push" aria-label="Avisos">
        <p>
          Los avisos de clase están bloqueados en este navegador. Para activarlos, abre los
          ajustes del sitio y permite las notificaciones de esta app.
        </p>
      </section>
    );
  }

  if (est !== 'pendiente') return null;

  return (
    <section className="aviso-push" aria-label="Avisos">
      <p>Recibe un aviso antes de tu clase para no olvidar tomar lista.</p>
      <button type="button" onClick={activar} disabled={ocupado}>Activar avisos</button>
    </section>
  );
}
