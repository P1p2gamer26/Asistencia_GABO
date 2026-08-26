import { useState } from 'react';

export type DiaMes = { classDate: string; late: number; absent: number; evasion: number };

const ANCHO = 320;
const ALTO = 110;
const PAD = { arriba: 8, derecha: 8, abajo: 16, izquierda: 22 };

// Los mismos colores de los estados en el resto del sistema.
const SERIES = [
  { clave: 'absent',  etiqueta: 'Faltaron',   color: '#c8503c' },
  { clave: 'evasion', etiqueta: 'Evasiones',  color: '#7a5ea8' },
  { clave: 'late',    etiqueta: 'Tarde',      color: '#d29b16' },
] as const;

const dia = (iso: string) => new Date(`${iso}T00:00`).getDate();

/**
 * Novedades por dia del mes en la esquina del inicio. Pequena a proposito: sirve para
 * ver el pico de un dia malo, no para leer valores exactos -- eso esta en el tablero.
 */
export default function LineasNovedades({ serie }: { serie: DiaMes[] }) {
  const [activo, setActivo] = useState<number | null>(null);
  if (serie.length === 0) return null;

  const anchoUtil = ANCHO - PAD.izquierda - PAD.derecha;
  const altoUtil = ALTO - PAD.arriba - PAD.abajo;
  // Escala comun a las tres series: si cada una tuviera la suya no se podrian comparar.
  const max = Math.max(1, ...serie.flatMap((d) => [d.late, d.absent, d.evasion]));
  const x = (i: number) => PAD.izquierda
    + (serie.length === 1 ? anchoUtil / 2 : (i * anchoUtil) / (serie.length - 1));
  const y = (v: number) => PAD.arriba + altoUtil - (v / max) * altoUtil;

  const d = activo !== null ? serie[activo] : null;

  return (
    <figure className="lineas-novedades">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" height={ALTO} role="img"
           aria-label={`Novedades por dia del mes: faltas, evasiones y llegadas tarde en ${serie.length} dias`}
           onMouseLeave={() => setActivo(null)}>
        <line x1={PAD.izquierda} y1={PAD.arriba + altoUtil} x2={ANCHO - PAD.derecha}
              y2={PAD.arriba + altoUtil} stroke="var(--rejilla)" />
        <text x={0} y={PAD.arriba + 8} fontSize={9} fill="var(--tinta-mute)">{max}</text>
        <text x={0} y={PAD.arriba + altoUtil} fontSize={9} fill="var(--tinta-mute)">0</text>

        {SERIES.map((s) => (
          <path key={s.clave} fill="none" stroke={s.color} strokeWidth={2}
                strokeLinejoin="round"
                d={serie.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p[s.clave])}`).join(' ')} />
        ))}

        {serie.map((p, i) => (
          <g key={p.classDate}>
            {activo === i && (
              <line x1={x(i)} y1={PAD.arriba} x2={x(i)} y2={PAD.arriba + altoUtil}
                    stroke="var(--rejilla)" />
            )}
            <rect x={x(i) - anchoUtil / (2 * Math.max(1, serie.length - 1))} y={0}
                  width={anchoUtil / Math.max(1, serie.length - 1)} height={ALTO}
                  fill="transparent" onMouseEnter={() => setActivo(i)} />
            <text x={x(i)} y={ALTO - 4} fontSize={8} textAnchor="middle" fill="var(--tinta-mute)">
              {dia(p.classDate)}
            </text>
          </g>
        ))}
      </svg>

      <figcaption className="meta">
        {d
          ? `Dia ${dia(d.classDate)}: ${d.absent} faltaron · ${d.evasion} evasiones · ${d.late} tarde`
          : SERIES.map((s) => (
              <span key={s.clave}><i style={{ background: s.color }} />{s.etiqueta}</span>
            ))}
      </figcaption>
    </figure>
  );
}
