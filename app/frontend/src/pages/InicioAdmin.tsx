import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../api/client';
import Kpi from '../components/charts/Kpi';

type ResumenHoy = {
  lectivo: boolean; fecha: string;
  bloquesEsperados: number; bloquesMarcados: number;
  presentes: number; tarde: number; ausentes: number; evasiones: number;
  ingresos: number; mesAsistencia: number; mesDiasLectivos: number;
};

const fechaLarga = (iso: string) =>
  new Date(`${iso}T00:00`).toLocaleDateString('es-CO',
    { weekday: 'long', day: 'numeric', month: 'long' });

export default function InicioAdmin() {
  const [hoy, setHoy] = useState<ResumenHoy | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get<ResumenHoy>('/api/reports/today')
       .then(setHoy)
       .catch(() => setError('No se pudo cargar el resumen de hoy. Requiere conexion.'))
       .finally(() => setCargando(false));
  }, []);

  const faltan = hoy ? hoy.bloquesEsperados - hoy.bloquesMarcados : 0;

  return (
    <main className="card ancha">
      <p className="meta">Hola, {getSession()?.fullName}</p>
      <h1>{hoy ? fechaLarga(hoy.fecha) : 'Hoy'}</h1>

      {error && <p role="alert" className="error">{error}</p>}
      {cargando && <p className="meta">Cargando...</p>}

      {hoy && !hoy.lectivo && (
        <p className="banner no-lectivo" role="status">
          Hoy no hay clase segun el calendario escolar.
        </p>
      )}

      {hoy && hoy.lectivo && (
        <>
          <div className="kpis">
            <Kpi valor={`${hoy.bloquesMarcados} de ${hoy.bloquesEsperados}`}
                 etiqueta="Bloques con asistencia tomada" alerta={faltan > 0} />
            <Kpi valor={hoy.ausentes} etiqueta="Ausentes hoy" alerta={hoy.ausentes > 0} />
            <Kpi valor={hoy.tarde} etiqueta="Llegadas tarde hoy" />
            <Kpi valor={hoy.evasiones} etiqueta="Evasiones hoy" alerta={hoy.evasiones > 0} />
            <Kpi valor={hoy.ingresos} etiqueta="Ingresos por porteria" />
          </div>

          {faltan > 0 && (
            <p className="meta">
              Faltan <strong>{faltan}</strong> bloques por reportar.{' '}
              <Link to="/consultas">Ver el detalle</Link>
            </p>
          )}
        </>
      )}

      {hoy && (
        <div className="grafica">
          <h3>En lo que va del mes</h3>
          <div className="kpis">
            <Kpi valor={hoy.mesAsistencia.toFixed(1)} sufijo="%" etiqueta="Asistencia del mes" />
          </div>
          <p className="meta">{hoy.mesDiasLectivos} dias lectivos transcurridos</p>
          <p className="meta"><Link to="/dashboard">Ver el tablero completo</Link></p>
        </div>
      )}
    </main>
  );
}
