import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../api/client';

type Bloque = {
  id: number; grade: string; weekday: number; blockNo: number; subject: string;
  startTime: string; endTime: string; room?: string; teacherName?: string;
};

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

/** Dia de la semana de hoy en formato 1..5; 0 si es fin de semana. */
function diaDeHoy(): number {
  const d = new Date().getDay();
  return d >= 1 && d <= 5 ? d : 0;
}

export default function Horario() {
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [curso, setCurso] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const puedeVerCursos = ['COORDINADOR', 'ADMIN'].includes(getSession()?.role ?? '');
  const hoy = diaDeHoy();

  useEffect(() => {
    setCargando(true);
    setError('');
    api.get<Bloque[]>(`/api/schedule/week${curso ? `?grade=${encodeURIComponent(curso)}` : ''}`)
       .then(setBloques)
       .catch(() => setError('No se pudo cargar el horario. Requiere conexion.'))
       .finally(() => setCargando(false));
  }, [curso]);

  const numeros = [...new Set(bloques.map((b) => b.blockNo))].sort((a, b) => a - b);

  return (
    <main className="card ancha">
      <h1>{curso ? `Horario del curso ${curso}` : 'Mi horario'}</h1>

      {puedeVerCursos && (
        <div className="leyenda" style={{ marginBottom: 12 }}>
          <label htmlFor="curso-horario">Ver el horario de un curso</label>
          <input id="curso-horario" value={curso} placeholder="601 (vacio = el mio)"
                 onChange={(e) => setCurso(e.target.value.trim())} />
        </div>
      )}

      {error && <p role="alert" className="error">{error}</p>}
      {cargando && <p className="meta">Cargando...</p>}

      {!cargando && !error && bloques.length === 0 && (
        <p className="meta">
          {curso
            ? `El curso ${curso} no tiene bloques asignados en el horario.`
            : 'No tiene bloques asignados en el horario. Avise a coordinacion.'}
        </p>
      )}

      {bloques.length > 0 && (
        <div className="tabla-scroll">
          <div className="horario" role="grid" aria-label="Horario semanal"
               style={{ gridTemplateColumns: `auto repeat(${DIAS.length}, 1fr)` }}>
            <div className="horario-esquina" role="columnheader" />
            {DIAS.map((d, i) => (
              <div key={d} role="columnheader"
                   className={`horario-cabecera ${hoy === i + 1 ? 'hoy' : ''}`}>
                {d}{hoy === i + 1 && <span className="etiqueta-hoy">hoy</span>}
              </div>
            ))}

            {numeros.map((n) => (
              <div key={`fila-${n}`} style={{ display: 'contents' }}>
                <div className="horario-bloque" role="rowheader">
                  <strong>{n}</strong>
                  <small>{bloques.find((b) => b.blockNo === n)?.startTime}</small>
                </div>
                {DIAS.map((dia, i) => {
                  const b = bloques.find((x) => x.blockNo === n && x.weekday === i + 1);
                  if (!b) {
                    return <div key={`${n}-${i}`} role="gridcell" className="horario-celda vacia" />;
                  }
                  return (
                    <div key={`${n}-${i}`} role="gridcell"
                         className={`horario-celda ${hoy === b.weekday ? 'hoy' : ''}`}
                         aria-label={`${dia}, bloque ${b.blockNo}: ${b.subject}, curso ${b.grade}`
                                     + (b.room ? `, en ${b.room}` : '')}>
                      <strong>{b.grade}</strong>
                      <span>{b.subject}</span>
                      {b.room && <small className="aula">{b.room}</small>}
                      {b.teacherName && curso && <small>{b.teacherName}</small>}
                      {!curso && (
                        // El nombre accesible lleva el curso para distinguir el enlace
                        // entre varias celdas; el texto visible no repite el "601" que
                        // ya muestra el <strong> de arriba, o getByText(/601/) seria ambiguo.
                        <Link to={`/asistencia?bloque=${b.id}`} className="tomar-lista"
                              aria-label={`Tomar la lista de ${b.grade}`}>
                          Tomar la lista
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
