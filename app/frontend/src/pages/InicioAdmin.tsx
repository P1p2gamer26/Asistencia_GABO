import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../api/client';
import Kpi from '../components/charts/Kpi';

// Solo datos del dia: el mes vive en Consultas y en el Tablero.
type ResumenHoy = {
  lectivo: boolean; fecha: string;
  bloquesEsperados: number; bloquesMarcados: number;
  presentes: number; tarde: number; ausentes: number; evasiones: number;
  ingresos: number;
};

type Novedad = {
  studentId: number; fullName: string; grade: string; classDate: string;
  // Las ausencias se agrupan por estudiante+dia (pueden cubrir varias materias),
  // asi que no siempre hay una sola materia que mostrar.
  subject: string | null; comment?: string;
};

type Novedades = { evasiones: Novedad[]; ausencias: Novedad[]; sinRegistros: boolean };

// Una fila por estudiante del endpoint de resumen; aqui se suma por curso.
type FilaResumen = { grade: string; present: number; late: number; absent: number; evasion: number };

// Bloques del dia por curso, del endpoint /api/reports/dia.
type BloqueDia = { blockNo: number; subject: string; teacherName: string; marcas: number; quienTomo: string | null };
type CursoDia = { grade: string; bloques: number; tomados: number; detalle: BloqueDia[] };
type DiaCursos = { fecha: string; cicloDia: number; cursos: CursoDia[] };

// Lo que se muestra por curso: bloques y conteos de hoy.
type CursoHoy = {
  grade: string; bloques: number; tomados: number;
  present: number; late: number; absent: number; evasion: number;
  pendientes: BloqueDia[];
};

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
        // Distinto de "cero novedades": aqui nadie ha tomado asistencia hoy,
        // asi que un "0" seria una buena noticia falsa.
        <p className="meta" role="status">
          Nadie ha registrado asistencia hoy todavia.
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

function TablaHoyPorCurso({ cursos }: { cursos: CursoHoy[] }) {
  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr><th>Curso</th><th className="num">Bloques tomados</th><th className="num">P</th>
              <th className="num">T</th><th className="num">F</th><th className="num">E</th>
              <th>Pendientes</th></tr>
        </thead>
        <tbody>
          {cursos.map((c) => (
            <tr key={c.grade}>
              <td><Link to={`/curso/${encodeURIComponent(c.grade)}`}>{c.grade}</Link></td>
              <td className="num">{c.tomados} de {c.bloques}</td>
              <td className="num">{c.present}</td>
              <td className="num">{c.late}</td>
              <td className="num">{c.absent}</td>
              <td className="num">{c.evasion}</td>
              <td>
                {c.pendientes.length === 0
                  ? <span className="meta">ninguno</span>
                  : c.pendientes.map((b) => (
                      <span key={b.blockNo} className="meta" style={{ display: 'block' }}>
                        Bloque {b.blockNo} · {b.subject} · {b.teacherName}
                      </span>
                    ))}
              </td>
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
  const [cursosHoy, setCursosHoy] = useState<CursoHoy[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<ResumenHoy>('/api/reports/today'),
      // dias=0: desde hoy hasta hoy, o sea solo el dia de hoy.
      api.get<Novedades>('/api/reports/novedades?dias=0&limite=5'),
    ])
      .then(([h, n]) => { setHoy(h); setNovedades(n); })
      .catch(() => setError('No se pudo cargar el resumen de hoy. Requiere conexion.'))
      .finally(() => setCargando(false));
  }, []);

  // Todos los cursos del dia (con sus bloques) cruzados con los conteos de marcas de hoy.
  useEffect(() => {
    if (!hoy?.fecha || !hoy.lectivo) return;
    Promise.all([
      api.get<DiaCursos>(`/api/reports/dia?fecha=${hoy.fecha}`),
      api.get<FilaResumen[]>(`/api/reports/summary?from=${hoy.fecha}&to=${hoy.fecha}`),
    ])
      .then(([dia, filas]) => {
        const marcas: Record<string, FilaResumen> = {};
        for (const f of filas) {
          const m = marcas[f.grade] ?? { grade: f.grade, present: 0, late: 0, absent: 0, evasion: 0 };
          m.present += f.present;
          m.late += f.late;
          m.absent += f.absent;
          m.evasion += f.evasion;
          marcas[f.grade] = m;
        }
        const lista: CursoHoy[] = dia.cursos.map((c) => {
          const m = marcas[c.grade];
          return {
            grade: c.grade,
            bloques: c.bloques,
            tomados: c.tomados,
            present: m?.present ?? 0,
            late: m?.late ?? 0,
            absent: m?.absent ?? 0,
            evasion: m?.evasion ?? 0,
            // Pendiente: bloque del dia sin ninguna marca.
            pendientes: c.detalle.filter((b) => b.marcas === 0),
          };
        });
        // Primero los cursos con bloques pendientes, y dentro de cada grupo por curso.
        lista.sort((a, b) =>
          (b.pendientes.length - a.pendientes.length) || a.grade.localeCompare(b.grade, 'es', { numeric: true }));
        setCursosHoy(lista);
      })
      .catch(() => setCursosHoy([]));
  }, [hoy?.fecha, hoy?.lectivo]);

  const faltan = hoy ? hoy.bloquesEsperados - hoy.bloquesMarcados : 0;

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
                    {faltan > 0 ? <> — faltan <strong>{faltan}</strong> por reportar.</> : '.'}
                    {' '}Hasta ahora hay <strong>{hoy.ausentes}</strong> ausencias,{' '}
                    <strong>{hoy.tarde}</strong> llegadas tarde y{' '}
                    <strong>{hoy.evasiones}</strong> evasiones.</>
                : <>Hoy no hay clase segun el calendario escolar.</>}
            </p>
          )}
        </div>
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
                 etiqueta="Bloques con asistencia tomada" alerta={faltan > 0 && 'pendiente'} />
            <Kpi valor={hoy.ausentes} etiqueta="Ausentes hoy" alerta={hoy.ausentes > 0} />
            <Kpi valor={hoy.tarde} etiqueta="Llegadas tarde hoy" />
            <Kpi valor={hoy.evasiones} etiqueta="Evasiones hoy" alerta={hoy.evasiones > 0 && 'evasion'} />
            <Kpi valor={hoy.ingresos} etiqueta="Ingresos por porteria" />
          </div>

          {cursosHoy.length > 0 && (
            <div className="grafica">
              <h3>Todos los cursos de hoy</h3>
              <TablaHoyPorCurso cursos={cursosHoy} />
              <p className="meta">
                Los cursos con bloques pendientes van primero. Para meses anteriores, usa{' '}
                <Link to="/consultas">Consultas</Link> o el <Link to="/dashboard">Tablero</Link>.
              </p>
            </div>
          )}
        </>
      )}

      {novedades && (
        <div className="novedades-grid">
          <ListaNovedades titulo="Evasiones de hoy" items={novedades.evasiones}
                           sinRegistros={novedades.sinRegistros}
                           vacioTexto="No hay evasiones registradas hoy." />
          <ListaNovedades titulo="Ausencias de hoy" items={novedades.ausencias}
                           sinRegistros={novedades.sinRegistros}
                           vacioTexto="No hay ausencias registradas hoy." />
        </div>
      )}
    </main>
  );
}
