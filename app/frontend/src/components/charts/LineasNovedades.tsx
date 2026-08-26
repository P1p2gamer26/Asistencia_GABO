import { useState } from 'react';

export type DiaMes = { classDate: string; late: number; absent: number; evasion: number };

const ANCHO = 520;
const ALTO = 200;
const PAD = { arriba: 14, derecha: 14, abajo: 26, izquierda: 30 };

// Los mismos colores de los estados en el resto del sistema.
const SERIES = [
  { clave: 'absent',  etiqueta: 'Faltaron',  color: '#c8503c' },
  { clave: 'evasion', etiqueta: 'Evasiones', color: '#7a5ea8' },
  { clave: 'late',    etiqueta: 'Tarde',     color: '#d29b16' },
] as const;

const dia = (iso: string) => new Date(`${iso}T00:00`).getDate();

/** Marcas del eje Y en numeros redondos: 0, la mitad y el maximo. */
function marcasY(max: number): number[] {
  return max <= 2 ? [0, max] : [0, Math.round(max / 2), max];
}

/**
 * Novedades por dia del mes. Tres series sobre una misma escala: lo que se busca aqui
 * es el dia que se sale de lo normal, no el valor exacto -- eso esta en el tablero.
 */
export default function LineasNovedades({ serie }: { serie: DiaMes[] }) {
  const [activo, setActivo] = useState<number | null>(null);
  if (serie.length === 0) return null;

  const anchoUtil = ANCHO - PAD.izquierda - PAD.derecha;
  const altoUtil = ALTO - PAD.arriba - PAD.abajo;
  const max = Math.max(1, ...serie.flatMap((d) => [d.late, d.absent, d.evasion]));
  const x = (i: number) => PAD.izquierda
    + (serie.length === 1 ? anchoUtil / 2 : (i * anchoUtil) / (serie.length - 1));
  const y = (v: number) => PAD.arriba + altoUtil - (v / max) * altoUtil;

  const d = activo !== null ? serie[activo] : null;
  // Con muchos dias las etiquetas se pisan: se muestra una de cada dos.
  const paso = serie.length > 16 ? 2 : 1;

  return (
    <figure className="lineas-novedades">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" role="img"
           aria-label={`Novedades por dia del mes: faltas, evasiones y llegadas tarde en ${serie.length} dias lectivos`}
           onMouseLeave={() => setActivo(null)}>
        <defs>
          {SERIES.map((s) => (
            <linearGradient key={s.clave} id={`grad-${s.clave}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {marcasY(max).map((v) => (
          <g key={v}>
            <line x1={PAD.izquierda} y1={y(v)} x2={ANCHO - PAD.derecha} y2={y(v)}
                  stroke="var(--rejilla)" strokeDasharray={v === 0 ? undefined : '3 4'} />
            <text x={PAD.izquierda - 6} y={y(v) + 3} fontSize={10} textAnchor="end"
                  fill="var(--tinta-mute)">{v}</text>
          </g>
        ))}

        {/* El area rellena distingue las tres series de un vistazo, sin leer la leyenda. */}
        {SERIES.map((s) => {
          const linea = serie.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p[s.clave])}`).join(' ');
          return (
            <g key={s.clave}>
              <path fill={`url(#grad-${s.clave})`} stroke="none"
                    d={`${linea} L ${x(serie.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} />
              <path fill="none" stroke={s.color} strokeWidth={2.5}
                    strokeLinecap="round" strokeLinejoin="round" d={linea} />
            </g>
          );
        })}

        {serie.map((p, i) => (
          <g key={p.classDate}>
            {activo === i && (
              <>
                <line x1={x(i)} y1={PAD.arriba} x2={x(i)} y2={y(0)} stroke="var(--tinta-mute)" />
                {SERIES.map((s) => (
                  <circle key={s.clave} cx={x(i)} cy={y(p[s.clave])} r={4}
                          fill={s.color} stroke="var(--superficie)" strokeWidth={2} />
                ))}
              </>
            )}
            <rect x={x(i) - anchoUtil / (2 * Math.max(1, serie.length - 1))} y={0}
                  width={anchoUtil / Math.max(1, serie.length - 1)} height={ALTO}
                  fill="transparent" onMouseEnter={() => setActivo(i)} />
            {i % paso === 0 && (
              <text x={x(i)} y={ALTO - 8} fontSize={10} textAnchor="middle"
                    fill={activo === i ? 'var(--tinta)' : 'var(--tinta-mute)'}>
                {dia(p.classDate)}
              </text>
            )}
          </g>
        ))}
      </svg>

      <figcaption>
        {d ? (
          <span className="detalle-dia">
            <strong>Dia {dia(d.classDate)}</strong>
            {SERIES.map((s) => (
              <span key={s.clave}><i style={{ background: s.color }} />{d[s.clave]} {s.etiqueta.toLowerCase()}</span>
            ))}
          </span>
        ) : (
          SERIES.map((s) => (
            <span key={s.clave}><i style={{ background: s.color }} />{s.etiqueta}</span>
          ))
        )}
      </figcaption>
    </figure>
  );
}
