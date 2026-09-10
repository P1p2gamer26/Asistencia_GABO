// Orden natural de nombres de curso. Espejo exacto de la funcion SQL orden_curso()
// (ver V64__orden_curso_oficial.sql): misma regla, un lugar en cada capa. Si se toca
// una, se toca la otra -- ordenCurso.test.ts y OrdenCursoTest.java comparten los casos.
//
// Los codigos reales del colegio son los del plano de matricula: '101'..'1102' de
// primero a once, mas preescolar ('PJ01', 'J01'..'J03', 'T01'..'T03') y aceleracion
// ('9901'..'9903'). El orden alfabetico de texto pondria '1001' antes que '101'.
// Lo que no calza con ningun formato se manda al final, ordenado alfabeticamente
// entre si: nunca desaparece ni rompe el orden.
const OFICIAL = /^([0-9]{1,2})([0-9]{2})$/;      // '601' -> grado 6, grupo 01
const PARALELO = /^([0-9]{1,2})([A-Za-z].*)$/;   // '10A' -> grado 10, paralelo A

// El grado va desplazado en +2 y con tres digitos para que prejardin (-2) y jardin
// (-1) no den negativo y para que aceleracion (99) quede al final sin trucos.
function clave(grado: number, resto: string): string {
  return `0${String(grado + 2).padStart(3, '0')}${resto}`;
}

function claveOrden(grade: string): string {
  if (/^PJ[0-9]+$/.test(grade)) return `0000${grade.slice(2)}`;
  if (/^J[0-9]+$/.test(grade)) return `0001${grade.slice(1)}`;
  if (/^T[0-9]+$/.test(grade)) return `0002${grade.slice(1)}`;
  const oficial = OFICIAL.exec(grade);
  if (oficial) return clave(Number(oficial[1]), oficial[2]);
  const paralelo = PARALELO.exec(grade);
  if (paralelo) return clave(Number(paralelo[1]), paralelo[2]);
  return `1${grade}`;
}

export function ordenCurso(a: string, b: string): number {
  const ca = claveOrden(a);
  const cb = claveOrden(b);
  // Comparacion cruda y no localeCompare: asi coincide con el ordenamiento de
  // Postgres, que es quien ordena las mismas listas en los reportes.
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}
