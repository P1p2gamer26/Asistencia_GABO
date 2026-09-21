import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Version instalada. La actualizacion es automatica (registerType autoUpdate en
 * vite.config.ts): el service worker nuevo toma el control y la pagina se recarga sola.
 * Aqui solo se le pide que busque novedades cada hora, para que un telefono que queda
 * abierto toda la jornada no se quede en la version de la manana.
 */
export default function Version() {
  const { updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      if (registro) setInterval(() => void registro.update(), 60 * 60 * 1000);
    },
  });
  const version = import.meta.env.VITE_VERSION ?? '0.0.0';

  // Si ya hay una version esperando (por ejemplo instalada con la app en segundo
  // plano), se aplica al volver a la pestana, no a mitad de una lista.
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') void updateServiceWorker(true); };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [updateServiceWorker]);

  return <div className="version"><small className="meta">v{version}</small></div>;
}
