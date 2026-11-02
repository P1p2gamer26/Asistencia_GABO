import { useMemo, useState } from 'react';
import { api, apiUrl, getSession } from '../api/client';

type Bloque = { blockNo: number; subject: string | null; teacherName: string | null };
type DiaSemana = { fecha: string; cicloDia: number | null; descripcion: string | null; bloques: Bloque[]; tipo: string };
type MarcaSemana = {
  classDate: string; blockNo: number; subject: string | null; teacherName: string | null;
  studentId: number; documentId: string; fullName: string; status: string; comment: string | null;
  recordedByName: string | null;
};
type Semana = {
  estudiantes: { id: number; documentId: string; fullName: string }[];
  dias: DiaSemana[];
  marcas: MarcaSemana[];
};
type FilaResumen = { studentId: number; grade: string; present: number; late: number; absent: number; evasion: number };
type ResumenCurso = { grade: string; presentes: number; tardes: number; ausentes: number; evasiones: number };
type DetalleEstudiante = {
  fullName: string; grade: string; present: number; late: number; absent: number; evasion: number;
  marcas: { classDate: string; blockNo: number; subject: string | null; status: string; comment: string | null;
            recordedByName: string | null; recordedAt: string | null }[];
};

const ESTADO: Record<string, string> = { P: 'Presente', T: 'Tarde', F: 'Falta', E: 'Evasión' };

const iso = (d: Date) => d.toLocaleDateString('en-CA');
/** Lunes de la semana que contiene `fecha` (YYYY-MM-DD). */
function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00`);
  const dia = d.getDay();                 // 0 domingo ... 6 sabado
  d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1));
  return iso(d);
}
const sumar = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T12:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const rotulo = (fecha: string) =>
  new Date(`${fecha}T12:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

/** Descarga un Excel autenticado. */
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

export default function CalendarioSemana({ setError }: { setError: (e: string) => void }) {
  const hoy = new Date();
  const [mes, setMes] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [elegido, setElegido] = useState<string | null>(null);   // dia tocado en el calendario
  const [lunes, setLunes] = useState<string | null>(null);       // semana consultada
  const [cursos, setCursos] = useState<ResumenCurso[]>([]);
  const [grade, setGrade] = useState<string | null>(null);
  const [semana, setSemana] = useState<Semana | null>(null);
  const [detalle, setDetalle] = useState<DetalleEstudiante | null>(null);
  const [cargando, setCargando] = useState(false);

  const viernes = lunes ? sumar(lunes, 4) : null;

  // Dias del mes en cuadricula lunes a domingo.
  const celdas = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const huecos = (primero.getDay() + 6) % 7;
    const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const lista: (string | null)[] = Array(huecos).fill(null);
    for (let i = 1; i <= dias; i++) lista.push(iso(new Date(mes.getFullYear(), mes.getMonth(), i)));
    return lista;
  }, [mes]);

  async function consultar(l: string) {
    setError('');
    setCargando(true);
    setGrade(null);
    setSemana(null);
    setDetalle(null);
    try {
      const v = sumar(l, 4);
      const filas = await api.get<FilaResumen[]>(`/api/reports/summary?from=${l}&to=${v}`);
      const acum = new Map<string, ResumenCurso>();
      for (const f of filas) {
        const c = acum.get(f.grade) ?? { grade: f.grade, presentes: 0, tardes: 0, ausentes: 0, evasiones: 0 };
        c.presentes += f.present;
        c.tardes += f.late;
        c.ausentes += f.absent;
        c.evasiones += f.evasion;
        acum.set(f.grade, c);
      }
      setCursos([...acum.values()]);
      setLunes(l);
    } catch {
      setError('No se pudo consultar la semana. Requiere conexion.');
    } finally {
      setCargando(false);
    }
  }

  async function abrirCurso(g: string) {
    if (!lunes || !viernes) return;
    setError('');
    setGrade(g);
    setDetalle(null);
    try {
      setSemana(await api.get<Semana>(
        `/api/reports/semana?grade=${encodeURIComponent(g)}&from=${lunes}&to=${viernes}`));
    } catch {
      setError('No se pudo cargar el curso.');
    }
  }

  async function verEstudiante(id: number) {
    if (!lunes || !viernes) return;
    setError('');
    try {
      setDetalle(await api.get<DetalleEstudiante>(
        `/api/reports/estudiante/${id}?from=${lunes}&to=${viernes}`));
    } catch {
      setError('No se pudo cargar el detalle del estudiante.');
    }
  }

  const nombreMes = mes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="filtros-tablero">
        <button type="button" className="secundario" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>« Mes anterior</button>
        <strong style={{ textTransform: 'capitalize' }}>{nombreMes}</strong>
        <button type="button" className="secundario" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>Mes siguiente »</button>
      </div>

      <table className="tabla-calendario" aria-label="Calendario del mes">
        <thead>
          <tr>{['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map((d) => <th key={d}>{d}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.ceil(celdas.length / 7) }, (_, fila) => (
            <tr key={fila}>
              {celdas.slice(fila * 7, fila * 7 + 7).map((f, i) => {
                if (!f) return <td key={i} />;
                const enSemana = lunes !== null && lunesDe(f) === lunes;
                return (
                  <td key={i}>
                    <button type="button" aria-pressed={elegido === f || enSemana}
                            className={`dia-calendario${enSemana ? ' en-semana' : ''}`}
                            onClick={() => setElegido(f)}>
                      {Number(f.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="meta">
        {elegido ? `Semana del ${rotulo(lunesDe(elegido))} al ${rotulo(sumar(lunesDe(elegido), 4))}`
          : 'Toca un dia del calendario para elegir su semana.'}
      </p>
      <button type="button" disabled={!elegido || cargando}
              onClick={() => elegido && void consultar(lunesDe(elegido))}>
        {cargando ? 'Consultando...' : 'Consultar semana'}
      </button>

      {lunes && !grade && (
        <section>
          <h2>Salones de la semana</h2>
          {cursos.length === 0 && <p className="meta">Nadie tiene marcas en esta semana.</p>}
          <div className="lista-salones">
            {cursos.map((c) => (
              <button key={c.grade} type="button" onClick={() => void abrirCurso(c.grade)}>
                <strong>{c.grade}</strong>
                <span className="meta">{c.ausentes} ausentes · {c.evasiones} evasiones · {c.tardes} tardes</span>
              </button>
            ))}
          </div>
          <button type="button" className="secundario"
                  onClick={() => bajarExcel(`tipo=semanal-cursos&from=${lunes}&to=${viernes}`,
                                            `semana_cursos_${lunes}_${viernes}.xlsx`)
                    .catch(() => setError('No se pudo descargar el Excel.'))}>
            Descargar Excel de la semana (una hoja por curso)
          </button>
        </section>
      )}

      {grade && semana && (
        <section>
          <button type="button" className="secundario" onClick={() => { setGrade(null); setDetalle(null); }}>« Volver a los salones</button>
          <h2>Curso {grade}</h2>

          <h3>Bloques de la semana</h3>
          {semana.dias.filter((d) => d.bloques.length > 0 || d.tipo === 'DIA_CERO' || d.descripcion).map((d) => (
            <div key={d.fecha} className="grafica">
              <strong>{rotulo(d.fecha)}</strong>
              <span className="meta"> · {d.cicloDia ? `Día ${d.cicloDia}` : d.descripcion ?? 'Sin clase'}</span>
              {d.bloques.length === 0 && d.tipo === 'DIA_CERO' && (
                <p className="meta">Día 0: asistencia general del día, sin bloques.</p>
              )}
              <ol>
                {d.bloques.map((b) => {
                  const marcasBloque = semana.marcas.filter((m) => m.classDate === d.fecha && m.blockNo === b.blockNo);
                  const quien = marcasBloque.find((m) => m.recordedByName)?.recordedByName;
                  return (
                    <li key={b.blockNo}>
                      Bloque {b.blockNo} · {b.subject ?? '—'} · {b.teacherName ?? '—'} ·{' '}
                      {marcasBloque.length === 0
                        ? <span className="meta">Pendiente</span>
                        : <>Tomada{quien ? ` por ${quien}` : ''}</>}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}

          <h3>Estudiantes</h3>
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Estudiante</th><th className="num">P</th><th className="num">T</th>
                  <th className="num">F</th><th className="num">E</th><th></th></tr></thead>
              <tbody>
                {semana.estudiantes.map((e) => {
                  const ms = semana.marcas.filter((m) => m.studentId === e.id);
                  const cuenta = (s: string) => ms.filter((m) => m.status === s).length;
                  return (
                    <tr key={e.id}>
                      <td>{e.fullName}</td>
                      <td className="num">{cuenta('P')}</td><td className="num">{cuenta('T')}</td>
                      <td className="num">{cuenta('F')}</td><td className="num">{cuenta('E')}</td>
                      <td><button type="button" className="secundario" onClick={() => void verEstudiante(e.id)}>Ver más detalle</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {detalle && (
            <section>
              <h3>{detalle.fullName} · {detalle.grade}</h3>
              <p className="meta">P {detalle.present} · T {detalle.late} · F {detalle.absent} · E {detalle.evasion}</p>
              <div className="tabla-scroll">
                <table>
                  <thead><tr><th>Fecha</th><th>Bloque</th><th>Materia</th><th>Estado</th>
                      <th>Registrado por</th><th>Hora</th><th>Comentario</th></tr></thead>
                  <tbody>
                    {detalle.marcas.map((m, i) => (
                      <tr key={i}>
                        <td>{m.classDate}</td><td>{m.blockNo}</td><td>{m.subject ?? ''}</td>
                        <td>{ESTADO[m.status] ?? m.status}</td><td>{m.recordedByName ?? ''}</td>
                        <td>{m.recordedAt ? new Date(m.recordedAt).toLocaleTimeString('es-CO', { timeStyle: 'short' }) : ''}</td>
                        <td>{m.comment ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <button type="button" className="secundario"
                  onClick={() => bajarExcel(`tipo=semanal&grade=${encodeURIComponent(grade)}&from=${lunes}&to=${viernes}`,
                                            `semana_${grade}_${lunes}_${viernes}.xlsx`)
                    .catch(() => setError('No se pudo descargar el Excel.'))}>
            Descargar Excel de este curso
          </button>
        </section>
      )}
    </div>
  );
}
