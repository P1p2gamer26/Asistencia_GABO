import { useEffect, useState } from 'react';
import { api, apiUrl, getSession } from '../api/client';
import { useCursos } from '../lib/useCursos';
import { useDebounce } from '../lib/useDebounce';

type Fila = {
  studentId: number; documentId: string; fullName: string; grade: string;
  present: number; late: number; absent: number; evasion: number; schoolDays: number;
  // Ausente cuando no hay ninguna marca en el periodo: no se inventa un 0% ni un 100%.
  attendanceRate?: number;
};

type DiaNoLectivoConMarcas = { fecha: string; tipo: string; marcas: number };

type EstudianteBusqueda = { id: number; documentId: string; fullName: string; grade: string };
type Marca = { classDate: string; blockNo: number; subject: string | null; status: string;
               comment: string | null; recordedByName: string | null; recordedAt: string | null };
type DetalleEstudiante = EstudianteBusqueda & {
  present: number; late: number; absent: number; evasion: number; marcas: Marca[];
};
type Toma = { classDate: string; grade: string; blockNo: number; subject: string | null;
              teacherName: string | null; recordedByName: string | null; lastRecordedAt: string | null;
              total: number; absent: number; evasion: number };
type Docente = { id: number; fullName: string };

type Modo = 'curso' | 'estudiante' | 'tomas';
const MODOS: { id: Modo; texto: string }[] = [
  { id: 'curso', texto: 'Por curso' },
  { id: 'estudiante', texto: 'Por estudiante' },
  { id: 'tomas', texto: 'Tomas de asistencia' },
];

const ESTADO: Record<string, string> = { P: 'Presente', T: 'Tarde', F: 'Falta', E: 'Evasión' };

const isoLocal = (d: Date) => d.toLocaleDateString('en-CA');   // YYYY-MM-DD en hora local
const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '';

/** Descarga un Excel autenticado con los parametros dados. Lanza si el servidor falla. */
async function bajarExcel(params: string, nombre: string) {
  const res = await fetch(apiUrl(`/api/reports/excel?${params}`), {
    headers: { Authorization: `Bearer ${getSession()!.token}` },
  });
  if (!res.ok) throw new Error();
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Consultas() {
  const hoy = new Date();
  const [modo, setModo] = useState<Modo>('curso');
  // Del 1 del mes a hoy por defecto: antes arrancaban vacias y "Consultar" quedaba
  // deshabilitado, asi que elegir un curso no mostraba nada y parecia roto.
  const [from, setFrom] = useState(isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [to, setTo] = useState(isoLocal(hoy));
  const [error, setError] = useState('');
  const cursos = useCursos();

  const fechas = (
    <>
      <label htmlFor="desde">Desde</label>
      <input id="desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <label htmlFor="hasta">Hasta</label>
      <input id="hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
    </>
  );

  return (
    <main className="card ancha">
      <h1>Consultas</h1>
      <div className="segmentado" role="group" aria-label="Tipo de consulta">
        {MODOS.map((m) => (
          <button key={m.id} type="button" aria-pressed={modo === m.id}
                  onClick={() => { setModo(m.id); setError(''); }}>{m.texto}</button>
        ))}
      </div>
      {modo === 'curso' && <PorCurso from={from} to={to} fechas={fechas} cursos={cursos} setError={setError} />}
      {modo === 'estudiante' && <PorEstudiante from={from} to={to} fechas={fechas} setError={setError} />}
      {modo === 'tomas' && <Tomas from={from} to={to} fechas={fechas} cursos={cursos} setError={setError} />}
      {error && <p role="alert" className="error">{error}</p>}
    </main>
  );
}

type Comun = { from: string; to: string; fechas: React.ReactNode; setError: (e: string) => void };

function PorCurso({ from, to, fechas, cursos, setError }: Comun & { cursos: string[] }) {
  const [grade, setGrade] = useState('');
  const [tipo, setTipo] = useState('resumen');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [diasNoLectivos, setDiasNoLectivos] = useState<DiaNoLectivoConMarcas[]>([]);

  // Al elegir curso (con las fechas ya puestas) se consulta solo: el usuario no tiene
  // que acordarse de pulsar "Consultar" para que aparezca la tabla.
  useEffect(() => {
    if (grade && from && to) void buscar();
  }, [grade, from, to]);   // eslint-disable-line react-hooks/exhaustive-deps

  const query = () => `grade=${encodeURIComponent(grade)}&from=${from}&to=${to}`;

  async function buscar() {
    setError('');
    try {
      setFilas(await api.get<Fila[]>(`/api/reports/summary?${query()}`));
      // No borra ni excluye nada de los totales: solo hace visible que el periodo
      // tiene marcas en dias que el calendario dice que no fueron lectivos, para
      // que un total raro se pueda explicar (ver informe del hallazgo).
      setDiasNoLectivos(await api.get<DiaNoLectivoConMarcas[]>(
        `/api/reports/dias-no-lectivos-con-marcas?from=${from}&to=${to}`));
    } catch {
      setError('No se pudo consultar. Requiere conexion.');
    }
  }

  async function descargar() {
    setError('');
    try {
      await bajarExcel(`${query()}&tipo=${tipo}`, `${tipo}_${grade || 'todos'}_${from}_${to}.xlsx`);
    } catch {
      setError('No se pudo descargar el informe.');
    }
  }

  return (
    <>
      <div className="filtros">
        <label htmlFor="curso">Curso</label>
        <select id="curso" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">Seleccione un curso...</option>
          {cursos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {fechas}
        <label htmlFor="tipo">Informe</label>
        <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="resumen">Resumen por estudiante</option>
          <option value="matriz">Asistencia dia por dia</option>
          <option value="inasistencias">Consolidado de inasistencias</option>
        </select>
      </div>
      <p className="meta">
        Elija un curso para ver la tabla. Para analizar el colegio entero, descargue
        el Excel: 1.200 estudiantes no se leen en una pantalla.
      </p>
      <button type="button" onClick={() => void buscar()} disabled={!grade || !from || !to}>
        Consultar
      </button>
      <button type="button" className="secundario" onClick={() => void descargar()}
              disabled={!from || !to}>
        Descargar Excel{grade ? ` (${grade})` : ' (todos los cursos)'}
      </button>
      {diasNoLectivos.length > 0 && (
        <p role="alert" className="aviso">
          Hay {diasNoLectivos.length} dia(s) no lectivo(s) con asistencia registrada
          en este periodo: {diasNoLectivos.map((d) => `${d.fecha} (${d.tipo}, ${d.marcas} marcas)`)
            .join('; ')}.
        </p>
      )}
      {filas.length > 0 && (
        <div className="tabla-scroll">
          <p className="meta">
            Dias lectivos: dias de clase del calendario en el periodo. P/T/F/E: marcas
            por clase (bloque) del estudiante, varias por dia -- no se comparan con los
            dias lectivos.
          </p>
          <table>
            <thead>
              <tr><th>Estudiante</th><th>Curso</th><th className="num">Dias lectivos</th>
                  <th className="num">P (clases)</th><th className="num">T (clases)</th>
                  <th className="num">F (clases)</th><th className="num">E (clases)</th>
                  <th className="num">% Asistencia</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.studentId}>
                  <td>{f.fullName}</td><td>{f.grade}</td>
                  <td className="num">{f.schoolDays}</td>
                  <td className="num">{f.present}</td><td className="num">{f.late}</td>
                  <td className="num">{f.absent}</td><td className="num">{f.evasion}</td>
                  <td className="num">
                    {f.attendanceRate == null ? 'Sin datos' : `${f.attendanceRate}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function PorEstudiante({ from, to, fechas, setError }: Comun) {
  const [texto, setTexto] = useState('');
  const q = useDebounce(texto.trim());
  const [resultados, setResultados] = useState<EstudianteBusqueda[]>([]);
  const [elegido, setElegido] = useState<EstudianteBusqueda | null>(null);
  const [detalle, setDetalle] = useState<DetalleEstudiante | null>(null);

  useEffect(() => {
    if (q.length < 2) { setResultados([]); return; }
    let vigente = true;
    api.get<EstudianteBusqueda[]>(`/api/reports/estudiantes?q=${encodeURIComponent(q)}`)
       .then((r) => { if (vigente) setResultados(r); })
       .catch(() => setError('No se pudo buscar. Requiere conexion.'));
    return () => { vigente = false; };
  }, [q]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!elegido || !from || !to) return;
    setError('');
    api.get<DetalleEstudiante>(`/api/reports/estudiante/${elegido.id}?from=${from}&to=${to}`)
       .then(setDetalle)
       .catch(() => setError('No se pudo consultar. Requiere conexion.'));
  }, [elegido, from, to]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function descargar() {
    if (!elegido) return;
    setError('');
    try {
      await bajarExcel(`tipo=individual&studentId=${elegido.id}&from=${from}&to=${to}`,
                       `informe_${elegido.documentId}_${from}_${to}.xlsx`);
    } catch {
      setError('No se pudo descargar el informe.');
    }
  }

  return (
    <>
      <div className="filtros">
        <label htmlFor="buscar">Estudiante</label>
        <input id="buscar" type="search" placeholder="Nombre, apellido o documento"
               value={texto} onChange={(e) => { setTexto(e.target.value); setElegido(null); setDetalle(null); }} />
        {fechas}
      </div>
      {!elegido && resultados.length > 0 && (
        <ul className="resultados-busqueda">
          {resultados.map((r) => (
            <li key={r.id}>
              <button type="button" className="secundario" onClick={() => { setElegido(r); setTexto(r.fullName); }}>
                {r.fullName} <small>{r.grade} · {r.documentId}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!elegido && q.length >= 2 && resultados.length === 0 && (
        <p className="meta">Ningún estudiante activo coincide con "{q}".</p>
      )}
      {detalle && (
        <>
          <header className="ficha-estudiante">
            <div>
              <h2>{detalle.fullName}</h2>
              <p className="meta">Curso {detalle.grade} · Documento {detalle.documentId}</p>
            </div>
            <dl className="totales">
              <div><dt>Presente</dt><dd>{detalle.present}</dd></div>
              <div><dt>Tarde</dt><dd>{detalle.late}</dd></div>
              <div><dt>Falta</dt><dd>{detalle.absent}</dd></div>
              <div><dt>Evasión</dt><dd>{detalle.evasion}</dd></div>
            </dl>
          </header>
          <button type="button" className="secundario" onClick={() => void descargar()}>
            Descargar Excel del estudiante
          </button>
          {detalle.marcas.length === 0
            ? <p className="meta">Sin marcas de asistencia en el periodo.</p>
            : (
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr><th>Fecha</th><th className="num">Bloque</th><th>Materia</th><th>Estado</th>
                        <th>Registrado por</th><th>Hora</th><th>Comentario</th></tr>
                  </thead>
                  <tbody>
                    {detalle.marcas.map((m, i) => (
                      <tr key={i} className={`estado-${m.status}`}>
                        <td>{m.classDate}</td><td className="num">{m.blockNo}</td><td>{m.subject ?? ''}</td>
                        <td><strong>{m.status}</strong> {ESTADO[m.status] ?? ''}</td>
                        <td>{m.recordedByName ?? ''}</td><td>{hora(m.recordedAt)}</td><td>{m.comment ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </>
      )}
    </>
  );
}

function Tomas({ from, to, fechas, cursos, setError }: Comun & { cursos: string[] }) {
  const [grade, setGrade] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [docentes, setDocentes] = useState<Docente[]>([]);
  const [filas, setFilas] = useState<Toma[] | null>(null);

  useEffect(() => {
    api.get<Docente[]>('/api/reports/docentes').then(setDocentes).catch(() => {});
  }, []);

  const query = () =>
    `from=${from}&to=${to}` + (grade ? `&grade=${encodeURIComponent(grade)}` : '')
    + (teacherId ? `&teacherId=${teacherId}` : '');

  useEffect(() => {
    if (!from || !to) return;
    setError('');
    api.get<Toma[]>(`/api/reports/tomas?${query()}`)
       .then(setFilas)
       .catch(() => setError('No se pudo consultar. Requiere conexion.'));
  }, [from, to, grade, teacherId]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function descargar() {
    setError('');
    try {
      await bajarExcel(`${query()}&tipo=tomas`, `tomas_${grade || 'todos'}_${from}_${to}.xlsx`);
    } catch {
      setError('No se pudo descargar el informe.');
    }
  }

  return (
    <>
      <div className="filtros">
        {fechas}
        <label htmlFor="curso-tomas">Curso</label>
        <select id="curso-tomas" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">Todos los cursos</option>
          {cursos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label htmlFor="docente">Docente</label>
        <select id="docente" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">Todos</option>
          {docentes.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
        </select>
      </div>
      <p className="meta">
        Una fila por clase con lista tomada. Si "Registro por" difiere del docente asignado,
        otra persona pasó la lista por el titular.
      </p>
      <button type="button" className="secundario" onClick={() => void descargar()} disabled={!from || !to}>
        Descargar Excel
      </button>
      {filas && filas.length === 0 && <p className="meta">Ninguna lista tomada con esos filtros.</p>}
      {filas && filas.length > 0 && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Curso</th><th className="num">Bloque</th><th>Materia</th>
                  <th>Docente asignado</th><th>Registro por</th><th>Hora</th>
                  <th className="num">Marcas</th><th className="num">Faltas</th><th className="num">Evasiones</th></tr>
            </thead>
            <tbody>
              {filas.map((t, i) => (
                <tr key={i}>
                  <td>{t.classDate}</td><td>{t.grade}</td><td className="num">{t.blockNo}</td><td>{t.subject ?? ''}</td>
                  <td>{t.teacherName ?? ''}</td>
                  <td className={t.recordedByName && t.recordedByName !== t.teacherName ? 'distinto' : undefined}>
                    {t.recordedByName ?? ''}
                  </td>
                  <td>{hora(t.lastRecordedAt)}</td>
                  <td className="num">{t.total}</td><td className="num">{t.absent}</td><td className="num">{t.evasion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
