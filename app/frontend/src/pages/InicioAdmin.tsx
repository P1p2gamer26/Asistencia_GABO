import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../api/client';
import Kpi from '../components/charts/Kpi';
import LineasNovedades from '../components/charts/LineasNovedades';
import type { DiaMes } from '../components/charts/LineasNovedades';

type CursoMes = {
  grade: string; present: number; late: number; absent: number; evasion: number;
  attendanceRate: number; sinRegistros: boolean;
};

type ResumenHoy = {
  lectivo: boolean; fecha: string;
  bloquesEsperados: number; bloquesMarcados: number;
  presentes: number; tarde: number; ausentes: number; evasiones: number;
  ingresos: number; mesAsistencia: number; mesDiasLectivos: number;
  mesPresentes: number; mesTarde: number; mesAusentes: number; mesEvasiones: number;
  mesPorCurso: CursoMes[];
  mesPorDia: DiaMes[];
};

type Novedad = {
  studentId: number; fullName: string; grade: string; classDate: string;
  // Las ausencias se agrupan por estudiante+dia (pueden cubrir varias materias),
  // asi que no siempre hay una sola materia que mostrar.
  subject: string | null; comment?: string;
};

type Novedades = { evasiones: Novedad[]; ausencias: Novedad[]; sinRegistros: boolean };

const fechaLarga = (iso: string) =>
  new Date(`${iso}T00:00`).toLocaleDateString('es-CO',
    { weekday: 'long', day: 'numeric', month: 'long' });

function ListaNovedades({ titulo, items, sinRegistros, vacioTexto }: {
  titulo: string; items: Novedad[]; sinRegistros: boolean; vacioTexto: string;
}) {
  return (
    <div className="grafica">
      <h3>{titulo}</h3>
      {sinRegistros ? (
        // Distinto de "cero novedades": aqui nadie ha tomado asistencia en el
        // periodo, asi que un "0" seria una buena noticia falsa.
        <p className="meta" role="status">
          Nadie ha registrado asistencia en este periodo todavia.
        </p>
      ) : items.length === 0 ? (
        <p className="meta">{vacioTexto}</p>
      ) : (
        <ul className="novedad-lista">
          {items.map((n) => (
            <li key={`${n.studentId}-${n.classDate}`} className="novedad-item">
              <strong>{n.fullName}</strong> <span className="curso">· curso {n.grade}</span>
              <br />
              <span className="meta">
                {n.classDate}{n.subject ? ` · ${n.subject}` : ''}{n.comment ? ` · ${n.comment}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TablaMesPorCurso({ cursos }: { cursos: CursoMes[] }) {
  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr><th>Curso</th><th className="num">Asistencia</th><th className="num">P</th>
              <th className="num">T</th><th className="num">F</th><th className="num">E</th></tr>
        </thead>
        <tbody>
          {cursos.map((c) => (
            <tr key={c.grade}>
              <td>{c.grade}</td>
              <td className="num">
                {c.sinRegistros
                  // Un curso sin ningun registro NO es 100% de asistencia: no se
                  // le pone un numero que se pueda confundir con uno real.
                  ? <span className="curso-sin-registros">sin registros</span>
                  : `${c.attendanceRate.toFixed(1)} %`}
              </td>
              <td className="num">{c.present}</td>
              <td className="num">{c.late}</td>
              <td className="num">{c.absent}</td>
              <td className="num">{c.evasion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InicioAdmin() {
  const [hoy, setHoy] = useState<ResumenHoy | null>(null);
  const [novedades, setNovedades] = useState<Novedades | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<ResumenHoy>('/api/reports/today'),
      api.get<Novedades>('/api/reports/novedades?dias=7&limite=5'),
    ])
      .then(([h, n]) => { setHoy(h); setNovedades(n); })
      .catch(() => setError('No se pudo cargar el resumen de hoy. Requiere conexion.'))
      .finally(() => setCargando(false));
  }, []);

  const faltan = hoy ? hoy.bloquesEsperados - hoy.bloquesMarcados : 0;
  // mesPorCurso ya viene de peor a mejor y los cursos sin registros van al final.
  const peorCurso = hoy?.mesPorCurso.find((c) => !c.sinRegistros) ?? null;

  return (
    <main className="card ancha">
      <div className="cabecera-inicio">
        <div className="cabecera-texto">
          <p className="meta">Hola, {getSession()?.fullName}</p>
          <h1>{hoy ? fechaLarga(hoy.fecha) : 'Hoy'}</h1>

          {/* El resumen en prosa: lo que uno le contaria a rectoria en dos frases,
              sin tener que leer la tabla de abajo. */}
          {hoy && (
            <p className="cabecera-resumen">
              {hoy.lectivo
                ? <>Hoy es dia lectivo. Se esperan <strong>{hoy.bloquesEsperados}</strong> llamados
                    de lista y van <strong>{hoy.bloquesMarcados}</strong>
                    {faltan > 0 ? <> — faltan <strong>{faltan}</strong> por reportar.</> : '.'}</>
                : <>Sin clases en el calendario de este dia: lo de abajo es el acumulado del mes.</>}
              {' '}En los <strong>{hoy.mesDiasLectivos}</strong> dias lectivos del mes la asistencia
              va en <strong>{hoy.mesAsistencia.toFixed(1)} %</strong>, con{' '}
              <strong>{hoy.mesAusentes}</strong> ausencias, <strong>{hoy.mesEvasiones}</strong>{' '}
              evasiones y <strong>{hoy.mesTarde}</strong> llegadas tarde.
              {peorCurso && <> El curso que va mas atras es <strong>{peorCurso.grade}</strong>.</>}
            </p>
          )}
        </div>
        {hoy && hoy.mesPorDia?.length > 0 && (
          <div className="cabecera-grafica">
            <h3>Novedades por dia del mes</h3>
            <LineasNovedades serie={hoy.mesPorDia} />
          </div>
        )}
      </div>

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

      {/* El mes no depende de que hoy sea lectivo: son datos acumulados de dias
          anteriores, y en un sabado o domingo son justamente lo que llena la
          pantalla en vez de dejarla vacia. */}
      {hoy && (
        <div className="grafica">
          <h3>En lo que va del mes</h3>
          <div className="kpis">
            <Kpi valor={hoy.mesAsistencia.toFixed(1)} sufijo="%" etiqueta="Asistencia del mes" principal />
            <Kpi valor={hoy.mesPresentes} etiqueta="Presentes (mes)" />
            <Kpi valor={hoy.mesTarde} etiqueta="Llegadas tarde (mes)" />
            <Kpi valor={hoy.mesAusentes} etiqueta="Ausentes (mes)" alerta={hoy.mesAusentes > 0} />
            <Kpi valor={hoy.mesEvasiones} etiqueta="Evasiones (mes)" alerta={hoy.mesEvasiones > 0} />
          </div>
          <p className="meta">{hoy.mesDiasLectivos} dias lectivos transcurridos</p>

          <h3>Asistencia por curso (peor a mejor)</h3>
          <TablaMesPorCurso cursos={hoy.mesPorCurso} />

          <p className="meta"><Link to="/dashboard">Ver el tablero completo</Link></p>
        </div>
      )}

      {novedades && (
        <div className="novedades-grid">
          <ListaNovedades titulo="Evasiones recientes" items={novedades.evasiones}
                           sinRegistros={novedades.sinRegistros}
                           vacioTexto="No hay evasiones registradas en este periodo." />
          <ListaNovedades titulo="Ausencias recientes" items={novedades.ausencias}
                           sinRegistros={novedades.sinRegistros}
                           vacioTexto="No hay ausencias registradas en este periodo." />
        </div>
      )}
    </main>
  );
}
