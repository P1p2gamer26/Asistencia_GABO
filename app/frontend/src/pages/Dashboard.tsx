import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Dashboard as DashboardData } from '../api/contract';
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
  const [dias, setDias] = useState(30);
  const [grade, setGrade] = useState('');
  const [datos, setDatos] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    setError('');
    const query = `from=${haceDias(dias)}&to=${hoyISO()}`
                + (grade ? `&grade=${encodeURIComponent(grade)}` : '');
    api.get<DashboardData>(`/api/reports/dashboard?${query}`)
       .then(setDatos)
       .catch(() => setError('No se pudo cargar el tablero. Requiere conexion.'))
       .finally(() => setCargando(false));
  }, [dias, grade]);

  return (
    <main className="card ancha">
      <span className="eyebrow">Periodo de {dias} dias{grade ? ` | curso ${grade}` : ''}</span>
      <h1>Tablero de asistencia</h1>

      {/* Los filtros van en una sola fila arriba, antes de las graficas */}
      <div className="filtros-tablero">
        {RANGOS.map((r) => (
          <button key={r.dias} type="button"
                  className={dias === r.dias ? undefined : 'secundario'}
                  aria-pressed={dias === r.dias}
                  onClick={() => setDias(r.dias)}>
            {r.etiqueta}
          </button>
        ))}
        <input aria-label="Filtrar por curso" placeholder="Curso (vacio = todos)"
               value={grade} onChange={(e) => setGrade(e.target.value)} />
      </div>

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

          <LineaTendencia serie={datos.trend} />
          <BarrasPorCurso datos={datos.byGrade} />
        </>
      )}
    </main>
  );
}
