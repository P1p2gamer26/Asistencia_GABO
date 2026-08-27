import { db } from '../db/local';

/**
 * Ultima respuesta buena de cada GET, para poder pintar algo sin señal.
 *
 * Vive en la misma tabla `meta` de Dexie y no en la Cache API del service worker
 * porque asi se puede decir de CUANDO son los datos, que es la diferencia entre
 * "informacion vieja" y "informacion falsa". El service worker nunca cachea /api:
 * una respuesta de asistencia servida como si fuera de ahora seria mentir.
 */
const clave = (path: string) => `lectura:${path}`;

export async function guardarLectura(path: string, datos: unknown): Promise<void> {
  await db.meta.put({
    key: clave(path),
    value: JSON.stringify({ cuando: new Date().toISOString(), datos }),
  });
}

export async function ultimaLectura<T>(path: string): Promise<{ datos: T; cuando: string } | null> {
  const fila = await db.meta.get(clave(path));
  if (!fila?.value) return null;
  try {
    return JSON.parse(fila.value) as { datos: T; cuando: string };
  } catch {
    // Un valor corrupto no puede tumbar una pantalla: se trata como si no hubiera.
    return null;
  }
}
