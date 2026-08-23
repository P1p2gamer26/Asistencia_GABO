// Orden natural de nombres de curso: '0A'..'11B' en vez de orden alfabetico de
// texto (que mete '10A' y '11B' entre '0A' y '1A'). Un valor que no calce con
// el formato "<numero><letra>" (p.ej. '601' o 'Transicion') se manda al final,
// ordenado alfabeticamente entre si -- nunca desaparece ni rompe el orden.
// Espejo de la funcion SQL orden_curso() (ver V60__orden_curso.sql): misma
// regla, un solo lugar en cada capa.
const FORMATO = /^([0-9]{1,2})([A-Za-z].*)$/;

function claveOrden(grade: string): string {
  const m = FORMATO.exec(grade);
  if (!m) return `1${grade}`;
  return `0${m[1].padStart(2, '0')}${m[2]}`;
}

export function ordenCurso(a: string, b: string): number {
  return claveOrden(a).localeCompare(claveOrden(b));
}
