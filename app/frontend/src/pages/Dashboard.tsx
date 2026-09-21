import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Dashboard as DashboardData } from '../api/contract';
import { useCursos } from '../lib/useCursos';
import Kpi from '../components/charts/Kpi';
import BarrasPorCurso from '../components/charts/BarrasPorCurso';
import LineaTendencia from '../components/charts/LineaTendencia';

const hoyISO = () => new Date().toLocaleDateString('en-CA');
const haceDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
};

const RANGOS = [
  { etiqueta: 'Ultimos 7 dias', dias: 7 },
  { etiqueta: 'Ultimos 30 dias', dias: 30 },
  { etiqueta: 'Ultimos 90 dias', dias: 90 },
];

export default function Dashboard() {
  // dias = 0 significa rango personalizado: manda lo que haya en desde/hasta.
  const [dias, setDias] = useState(30);
  const [from, setFrom] = useState(haceDias(30));
  const [to, setTo] = useState(hoyISO());
  const [grade, setGrade] = useState('');
  const cursos = useCursos();
  const [datos, setDatos] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const desde = dias ? haceDias(dias) : from;
  const hasta = dias ? hoyISO() : to;

  useEffect(() => {
    if (!desde || !hasta) return;
    setCargando(true);
    setError('');
    const query = `from=${desde}&to=${hasta}`
                + (grade ? `&grade=${encodeURIComponent(grade)}` : '');
    api.get<DashboardData>(`/api/reports/dashboard?${query}`)
       .then(setDatos)
       .catch(() => setError('No se pudo cargar el tablero. Requiere conexion.'))
       .finally(() => setCargando(false));
  }, [desde, hasta, grade]);

  const resumen = (dias ? `ultimos ${dias} dias` : `${desde} a ${hasta}`)
                + (grade ? ` · curso ${grade}` : ' · todos los cursos');

  return (
    <main className="card ancha">
      <span className="eyebrow">Periodo {resumen}</span>
      <h1>Tablero de asistencia</h1>

      <details className="filtros-desplegable" open>
        <summary>Filtros: {resumen}</summary>
        <div className="filtros-tablero">
          {RANGOS.map((r) => (
            <button key={r.dias} type="button"
                    className={dias === r.dias ? undefined : 'secundario'}
                    aria-pressed={dias === r.dias}
                    onClick={() => setDias(r.dias)}>
              {r.etiqueta}
            </button>
          ))}
          <button type="button" className={dias === 0 ? undefined : 'secundario'}
                  aria-pressed={dias === 0} onClick={() => setDias(0)}>
            Personalizado
          </button>
          {dias === 0 && (
            <>
              <label htmlFor="tablero-desde">Desde</label>
              <input id="tablero-desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <label htmlFor="tablero-hasta">Hasta</label>
              <input id="tablero-hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
          <select aria-label="Filtrar por curso" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">Todos los cursos</option>
            {cursos.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </details>

      {error && <p role="alert" className="error">{error}</p>}
      {cargando && <p className="meta">Cargando...</p>}

      {datos && (
        <>
          <div className="kpis">
            <Kpi valor={datos.kpi.attendanceRate.toFixed(1)} sufijo="%" principal
                 etiqueta="Asistencia del periodo" />
            <Kpi valor={datos.kpi.absentToday} etiqueta="Ausentes hoy"
                 alerta={datos.kpi.absentToday > 0} />
            <Kpi valor={datos.kpi.evasionsWeek} etiqueta="Evasiones esta semana"
                 alerta={datos.kpi.evasionsWeek > 0} />
            <Kpi valor={datos.kpi.blocksPending} etiqueta="Bloques sin marcar hoy"
                 alerta={datos.kpi.blocksPending > 0} />
            <Kpi valor={datos.kpi.schoolDays} etiqueta="Dias lectivos del periodo" />
          </div>

          <details className="seccion-desplegable" open>
            <summary>Tendencia diaria</summary>
            <LineaTendencia serie={datos.trend} />
          </details>
          <details className="seccion-desplegable" open>
            <summary>Asistencia por curso</summary>
            <BarrasPorCurso datos={datos.byGrade} />
          </details>
        </>
      )}
    </main>
  );
}
