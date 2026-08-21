import { useState } from 'react';
import { ESTADOS } from '../../api/contract';
import type { GradeBreakdown } from '../../api/contract';
import { segmentosApilados } from './geometria';

const ALTO_FILA = 34;
const ALTO_BARRA = 18;
const ANCHO_ETIQUETA = 52;
const GAP = 2;              // separacion entre segmentos: sin ella se leen como un bloque

export default function BarrasPorCurso({ datos }: { datos: GradeBreakdown[] }) {
  const [tabla, setTabla] = useState(false);
  const alto = Math.max(ALTO_FILA, datos.length * ALTO_FILA);
  const anchoUtil = 1000 - ANCHO_ETIQUETA;   // viewBox fijo; el SVG escala solo

  return (
    <figure className="grafica">
      <h3>Asistencia por curso</h3>
      <figcaption>Distribucion de registros en el periodo seleccionado</figcaption>

      {tabla ? (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>Curso</th>{ESTADOS.map((e) => <th key={e.valor} className="num">{e.etiqueta}</th>)}</tr>
            </thead>
            <tbody>
              {datos.map((d) => (
                <tr key={d.grade}>
                  <td>{d.grade}</td>
                  <td className="num">{d.present}</td><td className="num">{d.late}</td>
                  <td className="num">{d.absent}</td><td className="num">{d.evasion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg viewBox={`0 0 1000 ${alto}`} width="100%" height={alto} role="img"
             aria-label="Barras apiladas de asistencia por curso">
          {datos.map((d, fila) => {
            const y = fila * ALTO_FILA;
            const segs = segmentosApilados(d, anchoUtil);
            const total = d.present + d.late + d.absent + d.evasion;
            return (
              <g key={d.grade}>
                <text x={0} y={y + ALTO_BARRA - 3} fontSize={13} fill="var(--tinta-suave)">
                  {d.grade}
                </text>
                {segs.length === 0 && (
                  <text x={ANCHO_ETIQUETA} y={y + ALTO_BARRA - 3} fontSize={12} fill="var(--tinta-mute)">
                    sin registros
                  </text>
                )}
                {segs.map((s) => {
                  const color = ESTADOS.find((e) => e.valor === s.estado)!;
                  const ancho = Math.max(0, s.ancho - GAP);
                  const porcentaje = Math.round((s.valor / total) * 100);
                  return (
                    <g key={s.estado}>
                      <rect x={ANCHO_ETIQUETA + s.x} y={y} width={ancho} height={ALTO_BARRA}
                            rx={3} fill={color.color}>
                        <title>{`${d.grade} — ${color.etiqueta}: ${s.valor} (${porcentaje} %)`}</title>
                      </rect>
                      {ancho > 34 && (
                        <text x={ANCHO_ETIQUETA + s.x + ancho / 2} y={y + ALTO_BARRA - 5}
                              fontSize={11} textAnchor="middle"
                              fill={s.estado === 'T' || s.estado === 'E' ? '#0b0b0b' : '#ffffff'}
                              style={{ pointerEvents: 'none' }}>
                          {s.estado}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}

      <div className="leyenda">
        {ESTADOS.map((e) => (
          <span key={e.valor}><i style={{ background: e.color }} />{e.valor} · {e.etiqueta}</span>
        ))}
        <button type="button" className="secundario" style={{ minHeight: 32, padding: '4px 10px' }}
                onClick={() => setTabla(!tabla)}>
          {tabla ? 'Ver grafica' : 'Ver tabla'}
        </button>
      </div>
    </figure>
  );
}
