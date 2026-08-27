import { useEffect, useState } from 'react';

type PromptEvent = Event & { prompt: () => Promise<void> };

const esIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Instalar la aplicacion en el telefono. Es la unica forma de que funcione bien sin
 * senal: instalada arranca desde el service worker, sin depender de que el navegador
 * conserve la pestana.
 *
 * En iPhone no existe beforeinstallprompt, asi que no hay boton posible: lo unico
 * util es decir donde esta la opcion en Safari.
 */
export default function BotonInstalar() {
  const [evento, setEvento] = useState<PromptEvent | null>(null);
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    const capturar = (e: Event) => { e.preventDefault(); setEvento(e as PromptEvent); };
    const yaEsta = () => setInstalada(true);
    window.addEventListener('beforeinstallprompt', capturar);
    window.addEventListener('appinstalled', yaEsta);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturar);
      window.removeEventListener('appinstalled', yaEsta);
    };
  }, []);

  // Ya abierta como aplicacion instalada: ofrecer instalarla otra vez es ruido.
  if (instalada || window.matchMedia?.('(display-mode: standalone)').matches) return null;

  if (evento) {
    return (
      <div className="instalar">
        <button type="button" onClick={() => { void evento.prompt(); setEvento(null); }}>
          Instalar en el telefono
        </button>
        <small className="meta">Instalada funciona sin senal y arranca mas rapido.</small>
      </div>
    );
  }

  if (esIOS()) {
    return (
      <p className="instalar meta">
        Para usarla sin senal: pulse <strong>Compartir</strong> en Safari y luego{' '}
        <strong>Anadir a pantalla de inicio</strong>.
      </p>
    );
  }

  return null;
}
