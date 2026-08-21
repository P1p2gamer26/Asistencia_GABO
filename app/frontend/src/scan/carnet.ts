export type Carnet = { documentId: string; nombre: string; curso: string };

/**
 * Texto impreso en el carnet: "Alvaro Mathias Orozco Lara 1013696566 Primero - 103".
 * El documento es el primer numero de 6 a 12 digitos; lo de antes es el nombre y lo
 * de despues el curso. Los dos ultimos son informativos: manda la base de datos.
 */
export function parseCarnet(raw: string): Carnet | null {
  const texto = raw.replace(/\s+/g, ' ').trim();
  const m = texto.match(/\b(\d{6,12})\b/);
  if (!m) return null;
  return {
    documentId: m[1],
    nombre: texto.slice(0, m.index).trim(),
    curso: texto.slice(m.index! + m[1].length).trim(),
  };
}
