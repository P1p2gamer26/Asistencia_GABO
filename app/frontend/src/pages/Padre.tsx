import { useEffect, useState } from 'react';
import { api, clearSession, getSession } from '../api/client';

type Mark = { classDate: string; subject: string; status: string; comment?: string };
type Child = { studentId: number; fullName: string; grade: string; recent: Mark[] };

const ETIQUETA: Record<string, string> = {
  P: 'Presente', T: 'Llego tarde', F: 'No asistio', E: 'Evadio clase',
};

export default function Padre() {
  const [hijos, setHijos] = useState<Child[]>([]);
  const [error, setError] = useState('');

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
        const faltas = h.recent.filter((m) => m.status !== 'P').length;
        return (
          <section key={h.studentId}>
            <h2>{h.fullName} <small>({h.grade})</small></h2>
            <p className="meta">{faltas} novedad(es) en los ultimos 30 dias</p>
            <ul className="novedades">
              {h.recent.filter((m) => m.status !== 'P').map((m, i) => (
                <li key={i}>
                  <strong>{new Date(`${m.classDate}T00:00`).toLocaleDateString('es-CO')}</strong>
                  {' '}{m.subject}: {ETIQUETA[m.status] ?? m.status}
                  {m.comment && <em> — {m.comment}</em>}
                </li>
              ))}
            </ul>
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
