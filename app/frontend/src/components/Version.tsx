import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Version instalada y aviso de version nueva.
 *
 * El aviso es un boton y no una recarga automatica a proposito: recargar sola mientras
 * un docente esta tomando lista le vacia la pantalla a mitad del curso. Lo marcado no
 * se pierde (esta en IndexedDB), pero el susto y la lista a medio revisar si.
 */
export default function Version() {
  const { needRefresh: [hayNueva], updateServiceWorker } = useRegisterSW();
  const version = import.meta.env.VITE_VERSION ?? '0.0.0';

  return (
    <div className="version">
      {hayNueva && (
        <button type="button" onClick={() => void updateServiceWorker(true)}>
          Actualizar a la version nueva
        </button>
      )}
      <small className="meta">v{version}</small>
    </div>
  );
}
