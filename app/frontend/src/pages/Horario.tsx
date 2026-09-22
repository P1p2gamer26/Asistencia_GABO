import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../api/client';
import { db } from '../db/local';
import type { AdminUser } from '../api/contract';

type Bloque = {
  id: number; grade: string; weekday: number; blockNo: number; subject: string;
  startTime: string; endTime: string; room?: string; teacherName?: string;
};

const DIAS = ['Dia 1', 'Dia 2', 'Dia 3', 'Dia 4', 'Dia 5'];

export default function Horario() {
  const [bloques, setBloques] = useState<Bloque[]>([]);
  // "Ver el horario de": '' = el mio (por defecto), 'salon' o 'docente'.
  const [por, setPor] = useState('');
  const [salones, setSalones] = useState<string[]>([]);
  const [curso, setCurso] = useState('');
  const [docentes, setDocentes] = useState<AdminUser[]>([]);
  const [docente, setDocente] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [hoy, setHoy] = useState<number | null>(null);

  const puedeVerCursos = getSession()?.role === 'ADMIN';
  useEffect(() => {
    void db.schoolDays.get(new Date().toLocaleDateString('en-CA'))
      .then((dia) => setHoy(dia?.cycleDay ?? null));
  }, []);

  // Listas para los desplegables: salones y docentes. Son datos de coordinacion y
  // solo los necesita quien pueda pedir el horario de un curso ajeno.
  useEffect(() => {
    if (!puedeVerCursos) return;
    let vigente = true;
    api.get<string[]>('/api/schedule/grades')
       .then((d) => { if (vigente) setSalones(d); })
       .catch(() => {});
    api.get<AdminUser[]>('/api/admin/users?role=DOCENTE')
       .then((d) => { if (vigente) setDocentes(d); })
       .catch(() => {});
    return () => { vigente = false; };
  }, [puedeVerCursos]);

  // Se navega por curso (salon) y por docente: la pregunta de coordinacion es
  // "como quiero verlo", y luego el desplegable de la opcion elegida.
  useEffect(() => {
    // El guardia: si el filtro cambia mientras la peticion va en camino, la respuesta
    // vieja se descarta. Sin el, la respuesta de "60" puede llegar despues que la de
    // "601" y dejar la pantalla diciendo que 601 no tiene horario.
    let vigente = true;
    setCargando(true);
    setError('');
    const params = por === 'docente' && docente
      ? `?teacherId=${encodeURIComponent(docente)}`
      : por === 'salon' && curso ? `?grade=${encodeURIComponent(curso)}` : '';
    api.get<Bloque[]>(`/api/schedule/week${params}`)
       .then((b) => { if (vigente) setBloques(b); })
       .catch(() => { if (vigente) setError('No se pudo cargar el horario. Requiere conexion.'); })
       .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [curso, docente, por]);

  const numeros = [...new Set(bloques.map((b) => b.blockNo))].sort((a, b) => a - b);
  const docenteNombre = docentes.find((d) => String(d.id) === docente)?.fullName;

  return (
    <main className="card ancha">
      <h1>
        {docenteNombre ? `Horario de ${docenteNombre}`
          : curso ? `Horario del curso ${curso}`
          : 'Mi horario'}
      </h1>

      {puedeVerCursos && (
        <div className="filtros" style={{ marginBottom: 12, gridTemplateColumns: 'auto 1fr 1.4fr 1fr' }}>
          <label htmlFor="por-horario">Ver el horario de</label>
          <select id="por-horario" value={por}
                  onChange={(e) => { setPor(e.target.value); setCurso(''); setDocente(''); }}>
            <option value="">El mio</option>
            <option value="salon">Un salon</option>
            <option value="docente">Un docente</option>
          </select>
          {por === 'salon' && (
            <>
              <label htmlFor="salon-horario">Salon</label>
              <select id="salon-horario" value={curso}
                      onChange={(e) => setCurso(e.target.value)}>
                <option value="">Ninguno</option>
                {salones.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </>
          )}
          {por === 'docente' && (
            <>
              <label htmlFor="docente-horario">Docente</label>
              <select id="docente-horario" value={docente}
                      onChange={(e) => setDocente(e.target.value)}>
                <option value="">Ninguno</option>
                {docentes.map((d) => (
                  <option key={d.id} value={d.id}>{d.fullName}</option>
                ))}
              </select>
            </>
          )}
          {por === '' && <span className="meta" style={{ gridColumn: '2 / -1' }}>
            Elija salon o docente para ver el horario de otro.
          </span>}
        </div>
      )}

      {error && <p role="alert" className="error">{error}</p>}
      {cargando && <p className="meta">Cargando...</p>}

      {!cargando && !error && bloques.length === 0 && (
        <p className="meta">
          {docente
            ? `${docenteNombre ?? 'Ese docente'} no tiene bloques asignados en el horario.`
            : curso
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
                      {!curso && !docente && (
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
