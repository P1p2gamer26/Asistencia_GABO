import { useEffect, useState } from 'react';
import { servidorLento } from '../api/client';

/**
 * Franja que avisa mientras el servidor tarda en contestar: Render gratis se duerme
 * y puede tardar hasta ~3 min en despertar la primera vez del dia. Sin esto, el
 * docente veria un "Cargando..." mudo y creeria que no hay internet.
 */
export default function AvisoServidorLento() {
  const [lento, setLento] = useState(servidorLento());

  useEffect(() => {
    const alCambiar = () => setLento(servidorLento());
    window.addEventListener('servidor-lento', alCambiar);
    return () => window.removeEventListener('servidor-lento', alCambiar);
  }, []);

  if (!lento) return null;

  return (
    <div className="barra-offline aviso" role="status">
      <span>Conectando con el servidor... si es la primera entrada del dia puede tardar hasta 3 minutos. Lo que marque se guarda en este dispositivo.</span>
    </div>
  );
}
