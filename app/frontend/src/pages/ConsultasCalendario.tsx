import { useEffect, useMemo, useState } from 'react';
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
type BloqueDia = { blockNo: number; subject: string | null; teacherName: string | null; marcas: number; quienTomo: string | null };
type CursoDia = { grade: string; bloques: number; tomados: number; detalle: BloqueDia[] };
type DiaCursos = { fecha: string; cicloDia: number; cursos: CursoDia[] };
type DetalleEstudiante = {
  fullName: string; grade: string; present: number; late: number; absent: number; evasion: number;
  marcas: { classDate: string; blockNo: number; subject: string | null; status: string; comment: string | null;
            recordedByName: string | null; recordedAt: string | null }[];
};

type DiaCalendario = { calendarDate: string; dayType: string; description: string | null; cycleDay: number | null };
const ETIQUETA_TIPO: Record<string, string> = {
  FESTIVO: 'Festivo', VACACIONES: 'Vacaciones', INSTITUCIONAL: 'Inst.', SUSPENDIDO: 'Suspendido',
};

type Modo = 'dia' | 'semana';
type Paso = 'calendario' | 'salones' | 'estudiantes';
const ESTADO: Record<string, string> = { P: 'Presente', T: 'Tarde', F: 'Falta', E: 'Evasión' };
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const iso = (d: Date) => d.toLocaleDateString('en-CA');
/** Lunes de la semana que contiene `fecha` (YYYY-MM-DD). */
function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00`);
  const dia = d.getDay();
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
/** Dia de la semana (Lun..Dom) de una fecha YYYY-MM-DD. */
const diaSemanaDe = (fecha: string) => DIAS_SEMANA[(new Date(`${fecha}T12:00`).getDay() + 6) % 7];

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
  const [paso, setPaso] = useState<Paso>('calendario');
  const [modo, setModo] = useState<Modo>('dia');
  const [mes, setMes] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [elegido, setElegido] = useState<string | null>(null);
  // Por dia: salones de ese dia
  const [dia, setDia] = useState<DiaCursos | null>(null);
  // Por semana: lunes elegido y salones de la semana
  const [lunes, setLunes] = useState<string | null>(null);
  const [cursosSemana, setCursosSemana] = useState<ResumenCurso[]>([]);
  // Salon abierto: sus bloques/estudiantes y el detalle de un estudiante
  const [curso, setCurso] = useState<string | null>(null);
  const [semana, setSemana] = useState<Semana | null>(null);
  const [detalle, setDetalle] = useState<DetalleEstudiante | null>(null);
  const [cargando, setCargando] = useState(false);

  // Periodo consultado: un dia o la semana, segun el modo.
  const periodo = modo === 'dia'
    ? (elegido ? { from: elegido, to: elegido } : null)
    : (lunes ? { from: lunes, to: sumar(lunes, 4) } : null);

  const celdas = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const huecos = (primero.getDay() + 6) % 7;
    const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const lista: (string | null)[] = Array(huecos).fill(null);
    for (let i = 1; i <= dias; i++) lista.push(iso(new Date(mes.getFullYear(), mes.getMonth(), i)));
    return lista;
  }, [mes]);

  const enSemana = (f: string) => modo === 'semana' && lunes !== null && lunesDe(f) === lunes;

  // Tipo de cada dia y su dia de ciclo, como en la pantalla de Calendario.
  const [calDias, setCalDias] = useState<Record<string, DiaCalendario>>({});
  useEffect(() => {
    const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const desde = iso(new Date(mes.getFullYear(), mes.getMonth(), 1));
    const hasta = iso(new Date(mes.getFullYear(), mes.getMonth(), ultimo));
    api.get<DiaCalendario[]>(`/api/calendar/school-days?from=${desde}&to=${hasta}`)
      .then((lista) => setCalDias(Object.fromEntries(lista.map((d) => [d.calendarDate, d]))))
      .catch(() => setCalDias({}));
  }, [mes]);

  /** Etiqueta de la celda: "Día N", "Día 0" o el tipo de un dia no lectivo. */
  function etiquetaDia(f: string) {
    const d = calDias[f];
    if (!d) return null;
    if (d.dayType === 'DIA_CERO') return <span className="ciclo">Día 0</span>;
    if (d.cycleDay) return <span className="ciclo">Día {d.cycleDay}</span>;
    if (d.dayType !== 'LECTIVO') return <span className="tipo-corto">{d.description ?? ETIQUETA_TIPO[d.dayType] ?? d.dayType}</span>;
    return null;
  }

  function limpiarCurso() {
    setCurso(null);
    setSemana(null);
    setDetalle(null);
  }

  /** Toca un dia: en modo dia pasa directo a los salones de ese dia. */
  async function elegirDia(f: string) {
    setElegido(f);
    setError('');
    limpiarCurso();
    if (modo !== 'dia') return;
    setCargando(true);
    try {
      setDia(await api.get<DiaCursos>(`/api/reports/dia?fecha=${f}`));
      setPaso('salones');
    } catch {
      setError('No se pudo consultar el dia. Requiere conexion.');
    } finally {
      setCargando(false);
    }
  }

  async function consultarSemana() {
    if (!elegido) return;
    const l = lunesDe(elegido);
    setError('');
    setCargando(true);
    limpiarCurso();
    try {
      const filas = await api.get<FilaResumen[]>(`/api/reports/summary?from=${l}&to=${sumar(l, 4)}`);
      const acum = new Map<string, ResumenCurso>();
      for (const f of filas) {
        const c = acum.get(f.grade) ?? { grade: f.grade, presentes: 0, tardes: 0, ausentes: 0, evasiones: 0 };
        c.presentes += f.present;
        c.tardes += f.late;
        c.ausentes += f.absent;
        c.evasiones += f.evasion;
        acum.set(f.grade, c);
      }
      setCursosSemana([...acum.values()]);
      setLunes(l);
      setPaso('salones');
    } catch {
      setError('No se pudo consultar la semana. Requiere conexion.');
    } finally {
      setCargando(false);
    }
  }

  async function abrirCurso(g: string) {
    if (!periodo) return;
    setError('');
    setCurso(g);
    setDetalle(null);
    try {
      setSemana(await api.get<Semana>(
        `/api/reports/semana?grade=${encodeURIComponent(g)}&from=${periodo.from}&to=${periodo.to}`));
      setPaso('estudiantes');
    } catch {
      setError('No se pudo cargar el curso.');
    }
  }

  async function verEstudiante(id: number) {
    if (!periodo) return;
    setError('');
    try {
      setDetalle(await api.get<DetalleEstudiante>(
        `/api/reports/estudiante/${id}?from=${periodo.from}&to=${periodo.to}`));
    } catch {
      setError('No se pudo cargar el detalle del estudiante.');
    }
  }

  const cursoDia = dia?.cursos.find((c) => c.grade === curso) ?? null;
  const nombreMes = mes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const titulo = modo === 'dia' && elegido ? rotulo(elegido)
    : lunes ? `Semana del ${rotulo(lunes)} al ${rotulo(sumar(lunes, 4))}` : '';

  function volverCalendario() {
    setPaso('calendario');
    setDia(null);
    setLunes(null);
    limpiarCurso();
  }

  // ---------- Paso 1: calendario ----------
  if (paso === 'calendario') {
    return (
      <div>
        <div className="segmentado" role="group" aria-label="Consultar por">
          <button type="button" aria-pressed={modo === 'dia'} onClick={() => { setModo('dia'); setLunes(null); }}>Por dia</button>
          <button type="button" aria-pressed={modo === 'semana'} onClick={() => { setModo('semana'); setDia(null); }}>Por semana</button>
        </div>

        <div className="nav-mes">
          <button type="button" className="secundario" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>Mes anterior</button>
          <strong style={{ textTransform: 'capitalize' }}>{nombreMes}</strong>
          <button type="button" className="secundario" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>Mes siguiente</button>
        </div>

        <div className="calendario" role="grid" aria-label={`Calendario de ${nombreMes}`}>
          {DIAS_SEMANA.map((c) => <div key={c} className="calendario-cabecera" role="columnheader">{c}</div>)}
          {celdas.map((f, i) => f ? (
            <button key={f} type="button" role="gridcell"
                    className={`calendario-dia${f === elegido || enSemana(f) ? ' seleccionado' : ''}`}
                    aria-label={`${diaSemanaDe(f)} ${Number(f.slice(8))}`}
                    onClick={() => void elegirDia(f)}>
              <span className="dia-semana">{diaSemanaDe(f)}</span>
              <span className="numero">{Number(f.slice(8))}</span>
              {etiquetaDia(f)}
            </button>
          ) : <div key={`hueco-${i}`} className="calendario-hueco" role="gridcell" />)}
        </div>

        {modo === 'semana' && (
          <p>
            <button type="button" disabled={!elegido || cargando} onClick={() => void consultarSemana()}>
              {cargando ? 'Consultando...' : elegido ? 'Consultar la semana de este dia' : 'Toca un dia del calendario'}
            </button>
          </p>
        )}
        {modo === 'dia' && <p className="meta">Toca un dia para ver sus salones.</p>}
      </div>
    );
  }

  // ---------- Paso 2: salones ----------
  if (paso === 'salones') {
    return (
      <div>
        <button type="button" className="secundario" onClick={volverCalendario}>« Volver al calendario</button>
        <h2>{titulo}</h2>

        {modo === 'dia' && dia && (
          <>
            <p className="meta">Bloques del dia contra bloques tomados ese dia.</p>
            {dia.cursos.length === 0 && <p className="meta">Este dia no tiene clases por bloque.</p>}
            <div className="lista-salones">
              {dia.cursos.map((c) => (
                <button key={c.grade} type="button" onClick={() => void abrirCurso(c.grade)}>
                  <strong style={{ display: 'block' }}>Salón {c.grade}</strong>
                  <span className="meta">
                    {c.bloques === 0 ? 'Sin horario cargado' : `${c.tomados} de ${c.bloques} bloques tomados`}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {modo === 'semana' && lunes && (
          <>
            {cursosSemana.length === 0 && <p className="meta">Nadie tiene marcas en esta semana.</p>}
            <div className="lista-salones">
              {cursosSemana.map((c) => (
                <button key={c.grade} type="button" onClick={() => void abrirCurso(c.grade)}>
                  <strong style={{ display: 'block' }}>Salón {c.grade}</strong>
                  <span className="meta">{c.ausentes} ausentes · {c.evasiones} evasiones · {c.tardes} tardes</span>
                </button>
              ))}
            </div>
            <p>
              <button type="button" className="secundario"
                      onClick={() => bajarExcel(`tipo=semanal-cursos&from=${lunes}&to=${sumar(lunes, 4)}`,
                                                `semana_cursos_${lunes}_${sumar(lunes, 4)}.xlsx`)
                        .catch(() => setError('No se pudo descargar el Excel.'))}>
                Descargar Excel de la semana (una hoja por curso)
              </button>
            </p>
          </>
        )}
      </div>
    );
  }

  // ---------- Paso 3: estudiantes del salon ----------
  return (
    <div>
      <button type="button" className="secundario" onClick={() => { setPaso('salones'); limpiarCurso(); }}>« Volver a los salones</button>
      <h2>Salón {curso} · {titulo}</h2>

      {modo === 'dia' && cursoDia && (
        <div className="grafica">
          <strong>Bloques de este dia</strong>
          <ol>
            {cursoDia.detalle.map((b) => (
              <li key={b.blockNo}>
                Bloque {b.blockNo} · {b.subject ?? '—'} · {b.teacherName ?? '—'} ·{' '}
                {b.marcas > 0 ? <>Tomada{b.quienTomo ? ` por ${b.quienTomo}` : ''}</> : <span className="meta">Pendiente</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {modo === 'semana' && semana && semana.dias.filter((d) => d.bloques.length > 0).map((d) => (
        <div key={d.fecha} className="grafica">
          <strong>{rotulo(d.fecha)}</strong>
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

      {semana && periodo && (
        <>
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
        </>
      )}

      {detalle && (
        <section>
          <button type="button" className="secundario" onClick={() => setDetalle(null)}>« Volver a los estudiantes</button>
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

      {periodo && curso && (
        <p>
          <button type="button" className="secundario"
                  onClick={() => bajarExcel(`tipo=semanal&grade=${encodeURIComponent(curso)}&from=${periodo.from}&to=${periodo.to}`,
                                            `semana_${curso}_${periodo.from}_${periodo.to}.xlsx`)
                    .catch(() => setError('No se pudo descargar el Excel.'))}>
            Descargar Excel de este salón
          </button>
        </p>
      )}
    </div>
  );
}
