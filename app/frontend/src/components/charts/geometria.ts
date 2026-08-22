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

/**
 * Dominio vertical del grafico de tendencia. Si todos los valores son iguales
 * (un solo dia registrado, o una semana perfecta), se ensancha cinco puntos a cada
 * lado: sin eso las dos etiquetas del eje muestran el mismo numero y el punto queda
 * pegado al borde, que parece un fallo aunque el dato sea correcto.
 * El resultado nunca se sale de 0 a 100 porque es un porcentaje.
 */
/**
 * Ancho de la zona sensible de cada punto de la linea.
 *
 * Con 86 dias lectivos los puntos quedan a ~11 px: una zona fija de 20 px se solapa
 * con la vecina y tocar un dia devuelve otro. Con pocos dias pasa lo contrario, asi
 * que se acota por los dos lados: minimo 8 px para que el dedo acierte, maximo 44 px
 * para que con tres puntos la zona no ocupe un tercio del grafico.
 */
export function anchoZonaSensible(puntos: number, ancho: number): number {
  if (puntos <= 1) return 44;
  const separacion = ancho / (puntos - 1);
  return Math.min(44, Math.max(8, separacion));
}

export const dominioY = (serie: { attendanceRate: number }[]) => {
  const valores = serie.map((d) => d.attendanceRate);
  if (valores.length === 0) return { min: 0, max: 100 };

  const min = Math.min(...valores);
  const max = Math.max(...valores);
  if (max > min) return { min, max };

  return { min: Math.max(0, min - 5), max: Math.min(100, max + 5) };
};
