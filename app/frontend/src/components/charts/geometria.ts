import type { GradeBreakdown } from '../../api/contract';

export type Segmento = { estado: 'P' | 'T' | 'F' | 'E'; x: number; ancho: number; valor: number };

const CLAVES = [
  ['P', 'present'], ['T', 'late'], ['F', 'absent'], ['E', 'evasion'],
] as const;

/** Reparte el ancho entre los cuatro estados en el orden validado P, T, F, E. */
export function segmentosApilados(
  datos: Pick<GradeBreakdown, 'present' | 'late' | 'absent' | 'evasion'>,
  ancho: number,
): Segmento[] {
  const total = datos.present + datos.late + datos.absent + datos.evasion;
  if (total === 0) return [];

  let x = 0;
  return CLAVES.map(([estado, clave]) => {
    const valor = datos[clave];
    const w = (valor / total) * ancho;
    const seg = { estado, x, ancho: w, valor };
    x += w;
    return seg;
  });
}

export type Punto = { x: number; y: number; fecha: string; valor: number };

/**
 * Escala la serie al lienzo. El eje Y no arranca en cero a proposito: en asistencia
 * todo vive entre 85 % y 100 % y un eje desde cero aplanaria la linea hasta volverla
 * inutil. Se compensa etiquetando siempre el minimo y el maximo del eje.
 */
export function puntosLinea(
  serie: { classDate: string; attendanceRate: number }[],
  ancho: number,
  alto: number,
): Punto[] {
  if (serie.length === 0) return [];

  const valores = serie.map((d) => d.attendanceRate);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;          // una sola fecha, o todas iguales
  const pasoX = serie.length === 1 ? 0 : ancho / (serie.length - 1);

  return serie.map((d, i) => ({
    x: pasoX * i,
    y: alto - ((d.attendanceRate - min) / rango) * alto,
    fecha: d.classDate,
    valor: d.attendanceRate,
  }));
}

export const dominioY = (serie: { attendanceRate: number }[]) => {
  const valores = serie.map((d) => d.attendanceRate);
  return valores.length ? { min: Math.min(...valores), max: Math.max(...valores) } : { min: 0, max: 100 };
};
