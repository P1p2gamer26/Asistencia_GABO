import { useEffect, useState } from 'react';
import { api, clearSession, getSession } from '../api/client';

type Mark = { classDate: string; subject: string; status: string; comment?: string };
type BloqueHorario = {
  weekday: number; blockNo: number; subject: string; room: string;
  startTime: string; endTime: string; teacherName: string;
};
type Child = {
  studentId: number; fullName: string; grade: string;
  schoolDays: number; recordedDays: number;
  asistio: number; falto: number; tarde: number; evadio: number;
  recent: Mark[]; horario: BloqueHorario[];
};

const ETIQUETA: Record<string, string> = {
  P: 'Presente', T: 'Llego tarde', F: 'No asistio', E: 'Evadio clase',
};

const DIAS = ['', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

export default function Padre() {
  const [hijos, setHijos] = useState<Child[]>([]);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);

  useEffect(() => {
    api.get<Child[]>('/api/guardian/children')
       .then(setHijos)
       .catch(() => setError('No se pudo consultar. Intente con conexion a internet.'));
  }, []);

  return (
    <main className="card">
      <h1>Asistencia de mis hijos</h1>
      <p>{getSession()!.fullName}</p>
      {error && <p role="alert" className="error">{error}</p>}
      {hijos.map((h) => {
        const novedades = h.recent.filter((m) => m.status !== 'P');
        const resumen =
          h.recordedDays === 0
            // Un padre lee "0 novedades" como "le fue bien". Si nadie tomo asistencia,
            // eso seria prometerle una tranquilidad que el sistema no puede respaldar.
            ? 'Todavia no hay registros de este periodo.'
            : novedades.length > 0
              ? `${novedades.length} novedad(es) en ${h.recordedDays} de ${h.schoolDays} dias registrados.`
              : h.recordedDays >= h.schoolDays
                ? `Asistio a las ${h.recordedDays} clases registradas, sin novedades.`
                : `Sin novedades en ${h.recordedDays} de ${h.schoolDays} dias registrados.`;
        return (
          <section key={h.studentId}>
            <h2>{h.fullName} <small>({h.grade})</small></h2>
            <p className="meta">{resumen}</p>
            {h.recordedDays > 0 && (
              <ul className="conteo-hijo">
                <li>{h.asistio} dias asistio</li>
                <li>{h.falto} dias falto</li>
                {h.tarde > 0 && <li>{h.tarde} dias llego tarde</li>}
                {h.evadio > 0 && <li>{h.evadio} dias evadio clase</li>}
              </ul>
            )}
            <ul className="novedades">
              {novedades.map((m, i) => (
                <li key={i}>
                  <strong>{new Date(`${m.classDate}T00:00`).toLocaleDateString('es-CO')}</strong>
                  {' '}{m.subject}: {ETIQUETA[m.status] ?? m.status}
                  {m.comment && <em> — {m.comment}</em>}
                </li>
              ))}
            </ul>
            <button type="button" className="secundario"
                    aria-expanded={abierto === h.studentId}
                    aria-label={`Horario de ${h.fullName}`}
                    onClick={() => setAbierto(abierto === h.studentId ? null : h.studentId)}>
              Horario
            </button>
            {abierto === h.studentId && (
              h.horario.length === 0
                ? <p className="meta">Este curso no tiene horario cargado todavia.</p>
                : <ul className="horario-hijo">
                    {h.horario.map((b, i) => (
                      <li key={i}>
                        <strong>{DIAS[b.weekday]}</strong> {b.startTime} — {b.subject}
                        {b.room && <em className="aula"> en {b.room}</em>}
                        {b.teacherName && <span className="meta"> con {b.teacherName}</span>}
                      </li>
                    ))}
                  </ul>
            )}
          </section>
        );
      })}
      <button type="button" className="secundario"
              onClick={() => { clearSession(); location.href = '/login'; }}>
        Cerrar sesion
      </button>
    </main>
  );
}
