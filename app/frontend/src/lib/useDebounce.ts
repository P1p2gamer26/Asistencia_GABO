import { useEffect, useState } from 'react';

/**
 * Retrasa un valor que viene de un campo de texto. Sin esto, escribir "601" en el
 * filtro de curso dispara tres consultas (6, 60, 601) y la respuesta de "60" puede
 * llegar despues que la de "601" y pisarla: el usuario ve "no tiene bloques" para un
 * curso que si tiene. La carrera la corta ademas el guardia de respuesta vieja en
 * cada efecto; esto solo evita el trafico de mas.
 */
export function useDebounce<T>(valor: T, ms = 300): T {
  const [tardio, setTardio] = useState(valor);

  useEffect(() => {
    const t = setTimeout(() => setTardio(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);

  return tardio;
}
