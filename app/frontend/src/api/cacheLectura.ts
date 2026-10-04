import { db } from '../db/local';

/**
 * Ultima respuesta buena de cada GET, para poder pintar algo sin señal.
 *
 * Vive en la misma tabla `meta` de Dexie y no en la Cache API del service worker
 * porque asi se puede decir de CUANDO son los datos, que es la diferencia entre
 * "informacion vieja" y "informacion falsa". El service worker nunca cachea /api:
 * una respuesta de asistencia servida como si fuera de ahora seria mentir.
 */
// Con el usuario en la clave: en un celular compartido, quien entra despues sin senal
// no ve lo que consulto el anterior.
const clave = (path: string, usuario?: number) => `lectura:${usuario ?? 'anon'}:${path}`;

export async function guardarLectura(path: string, datos: unknown, usuario?: number): Promise<void> {
  await db.meta.put({
    key: clave(path, usuario),
    value: JSON.stringify({ cuando: new Date().toISOString(), datos }),
  });
}

export async function ultimaLectura<T>(path: string, usuario?: number): Promise<{ datos: T; cuando: string } | null> {
  const fila = await db.meta.get(clave(path, usuario));
  if (!fila?.value) return null;
  try {
    return JSON.parse(fila.value) as { datos: T; cuando: string };
  } catch {
    // Un valor corrupto no puede tumbar una pantalla: se trata como si no hubiera.
    return null;
  }
}
