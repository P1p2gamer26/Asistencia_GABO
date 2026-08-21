import { useState } from 'react';
import { dominioY, puntosLinea } from './geometria';

const ANCHO = 1000;
const ALTO = 220;
const PAD = { arriba: 12, derecha: 12, abajo: 26, izquierda: 46 };

type Props = { serie: { classDate: string; attendanceRate: number }[] };

const fecha = (iso: string) =>
  new Date(`${iso}T00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

export default function LineaTendencia({ serie }: Props) {
  const [activo, setActivo] = useState<number | null>(null);

  const anchoUtil = ANCHO - PAD.izquierda - PAD.derecha;
  const altoUtil = ALTO - PAD.arriba - PAD.abajo;
  const puntos = puntosLinea(serie, anchoUtil, altoUtil);
  const { min, max } = dominioY(serie);

  if (puntos.length === 0) {
    return (
      <figure className="grafica">
        <h3>Tendencia diaria de asistencia</h3>
        <p className="meta">Sin registros en el periodo seleccionado.</p>
      </figure>
    );
  }

  const trazo = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <figure className="grafica">
      <h3>Tendencia diaria de asistencia</h3>
      <figcaption>Porcentaje de presentes y llegadas tarde sobre el total de registros del dia</figcaption>

      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" height={ALTO} role="img"
           aria-label={`Tendencia de asistencia entre ${min} y ${max} por ciento`}
           onMouseLeave={() => setActivo(null)}>
        <g transform={`translate(${PAD.izquierda}, ${PAD.arriba})`}>
          {[0, altoUtil].map((y, i) => (
            <g key={y}>
              <line x1={0} y1={y} x2={anchoUtil} y2={y} stroke="var(--rejilla)" strokeWidth={1} />
              <text x={-8} y={y + 4} fontSize={11} textAnchor="end" fill="var(--tinta-mute)">
                {(i === 0 ? max : min).toFixed(1)}%
              </text>
            </g>
          ))}

          <path d={trazo} fill="none" stroke="var(--verde)" strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" />

          {activo !== null && (
            <line x1={puntos[activo].x} y1={0} x2={puntos[activo].x} y2={altoUtil}
                  stroke="var(--eje)" strokeWidth={1} strokeDasharray="3 3" />
          )}

          {puntos.map((p, i) => (
            <g key={p.fecha}>
              <rect x={p.x - 10} y={0} width={20} height={altoUtil} fill="transparent"
                    tabIndex={0} role="button"
                    aria-label={`${fecha(p.fecha)}: ${p.valor} por ciento`}
                    onMouseEnter={() => setActivo(i)} onFocus={() => setActivo(i)} />
              <circle cx={p.x} cy={p.y} r={activo === i ? 6 : 4}
                      fill="var(--verde)" stroke="var(--superficie)" strokeWidth={2} />
            </g>
          ))}

          <text x={0} y={altoUtil + 18} fontSize={11} fill="var(--tinta-mute)">
            {fecha(puntos[0].fecha)}
          </text>
          {puntos.length > 1 && (
            <text x={anchoUtil} y={altoUtil + 18} fontSize={11} textAnchor="end"
                  fill="var(--tinta-mute)">
              {fecha(puntos[puntos.length - 1].fecha)}
            </text>
          )}
        </g>
      </svg>

      <p className="meta" role="status" style={{ minHeight: '1.4em' }}>
        {activo !== null
          ? `${fecha(puntos[activo].fecha)}: ${puntos[activo].valor} % de asistencia`
          : 'Pase el cursor o toque la linea para ver cada dia.'}
      </p>
    </figure>
  );
}
