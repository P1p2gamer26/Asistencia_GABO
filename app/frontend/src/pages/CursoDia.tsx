import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ESTADOS } from '../api/contract';

type Bloque = { blockNo: number; subject: string | null; teacherName: string | null };
type DiaSemana = { fecha: string; cicloDia: number | null; descripcion: string | null; bloques: Bloque[]; tipo: string };
type Marca = { classDate: string; blockNo: number; studentId: number; status: string; comment: string | null };
type Respuesta = {
  estudiantes: { id: number; documentId: string; fullName: string }[];
  dias: DiaSemana[];
  marcas: Marca[];
};

const hoyISO = () => new Date().toLocaleDateString('en-CA');
const sumarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};
const esFinDeSemana = (iso: string) => [0, 6].includes(new Date(`${iso}T12:00`).getDay());
// Solo se navega por dias de semana: el sabado y el domingo no tienen clases.
const diaHabil = (iso: string, paso: number) => {
  let f = iso;
  do { f = sumarDias(f, paso); } while (esFinDeSemana(f));
  return f;
};
const diaInicial = () => {
  let f = hoyISO();
  while (esFinDeSemana(f)) f = sumarDias(f, -1);
  return f;
};
const rotulo = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

/** Que bloques ya se tomaron ese dia y como van sus marcas. */
function ResumenBloques({ bloques, estudiantes, marcas, fecha }: {
  bloques: Bloque[]; estudiantes: { id: number }[]; marcas: Marca[]; fecha: string;
}) {
  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th>Bloque</th><th>Materia</th><th>Docente</th><th>Estado</th>
            {ESTADOS.map((e) => <th key={e.valor} className="num">{e.valor}</th>)}
          </tr>
        </thead>
        <tbody>
          {bloques.map((b) => {
            const delBloque = marcas.filter((m) => m.blockNo === b.blockNo && m.classDate === fecha);
            const marcados = new Set(delBloque.map((m) => m.studentId)).size;
            const total = estudiantes.length;
            const estado = marcados === 0 ? 'Pendiente'
              : marcados < total ? `Parcial (${marcados} de ${total})`
              : 'Tomada';
            return (
              <tr key={b.blockNo}>
                <td>{b.blockNo}</td>
                <td>{b.subject ?? '—'}</td>
                <td>{b.teacherName ?? '—'}</td>
                <td>{estado}</td>
                {ESTADOS.map((e) => (
                  <td key={e.valor} className="num">{delBloque.filter((m) => m.status === e.valor).length}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Dia 0: asistencia general del dia, una marca por estudiante y sin bloques. */
function FormularioDiaCero({ grade, fecha, estudiantes }: {
  grade: string; fecha: string; estudiantes: { id: number; fullName: string }[];
}) {
  const [marcas, setMarcas] = useState<Record<number, string>>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setCargando(true);
    setError('');
    setAviso('');
    api.get<{ studentId: number; status: string }[]>(
      `/api/dia-cero?grade=${encodeURIComponent(grade)}&date=${fecha}`)
      .then((lista) => setMarcas(Object.fromEntries(lista.map((m) => [m.studentId, m.status]))))
      .catch(() => setError('No se pudo cargar la asistencia del dia. Requiere conexion.'))
      .finally(() => setCargando(false));
  }, [grade, fecha]);

  async function guardar() {
    setGuardando(true);
    setAviso('');
    setError('');
    const body = {
      grade, date: fecha,
      marcas: Object.entries(marcas).map(([id, status]) => ({ studentId: Number(id), status, comment: null })),
    };
    try {
      await api.put('/api/dia-cero', body);
      setAviso('Asistencia guardada.');
    } catch {
      setError('No se pudo guardar. Revisa la conexion y vuelve a intentar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grafica">
      <h3>Asistencia general del dia</h3>
      <p className="meta">Dia 0: los estudiantes asisten al colegio sin clases por bloque. No marcar a alguien no genera pendientes.</p>
      {cargando && <p className="meta">Cargando...</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {!cargando && (
        <>
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Estudiante</th><th>Estado</th></tr></thead>
              <tbody>
                {estudiantes.map((e) => (
                  <tr key={e.id}>
                    <td>{e.fullName}</td>
                    <td>
                      <div className="segmentado">
                        {ESTADOS.map((st) => (
                          <button key={st.valor} type="button"
                                  aria-pressed={marcas[e.id] === st.valor}
                                  aria-label={`${e.fullName}: ${st.etiqueta}`}
                                  onClick={() => setMarcas((m) => {
                                    // Otro clic en el mismo estado lo quita: un P por error se corrige solo.
                                    const siguiente = { ...m };
                                    if (siguiente[e.id] === st.valor) delete siguiente[e.id];
                                    else siguiente[e.id] = st.valor;
                                    return siguiente;
                                  })}>
                            {st.valor}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <button type="button" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar asistencia'}
            </button>
          </p>
          {aviso && <p role="status" className="meta">{aviso}</p>}
        </>
      )}
    </div>
  );
}

export default function CursoDia() {
  const { grade = '' } = useParams();
  const [fecha, setFecha] = useState(diaInicial);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    setError('');
    setDatos(null);
    api.get<Respuesta>(`/api/reports/semana?grade=${encodeURIComponent(grade)}&from=${fecha}&to=${fecha}`)
      .then(setDatos)
      .catch(() => setError('No se pudo cargar el curso. Requiere conexion.'))
      .finally(() => setCargando(false));
  }, [grade, fecha]);

  const dia = datos?.dias.find((d) => d.fecha === fecha);
  const bloques = [...(dia?.bloques ?? [])].sort((a, b) => a.blockNo - b.blockNo);
  const marcaDe = (studentId: number, blockNo: number) =>
    datos?.marcas.find((m) => m.studentId === studentId && m.blockNo === blockNo && m.classDate === fecha);

  return (
    <main className="card ancha">
      <p><Link to="/">« Volver al inicio</Link></p>
      <span className="eyebrow">Curso {grade}</span>
      <h1>{rotulo(fecha)}</h1>

      <div className="filtros-tablero">
        <button type="button" className="secundario" onClick={() => setFecha(diaHabil(fecha, -1))}>
          « Dia anterior
        </button>
        <button type="button" className="secundario" onClick={() => setFecha(diaInicial())}>Hoy</button>
        <button type="button" className="secundario" onClick={() => setFecha(diaHabil(fecha, 1))}>
          Dia siguiente »
        </button>
      </div>

      {error && <p role="alert" className="error">{error}</p>}
      {cargando && <p className="meta">Cargando...</p>}

      {datos && dia?.tipo === 'DIA_CERO' && (
        <FormularioDiaCero grade={grade} fecha={fecha} estudiantes={datos.estudiantes} />
      )}

      {datos && dia?.tipo !== 'DIA_CERO' && bloques.length === 0 && (
        <p className="meta">{dia?.descripcion ?? 'Sin clases este dia.'}</p>
      )}

      {datos && bloques.length > 0 && (
        <>
          <h3>Bloques del dia</h3>
          <ResumenBloques bloques={bloques} estudiantes={datos.estudiantes} marcas={datos.marcas} fecha={fecha} />
          <h3>Estudiantes por bloque</h3>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Estudiante</th>
                  {bloques.map((b) => (
                    <th key={b.blockNo} className="num" title={b.teacherName ?? undefined}>
                      {b.subject ?? `Bloque ${b.blockNo}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos.estudiantes.map((e) => (
                  <tr key={e.id}>
                    <td>{e.fullName}</td>
                    {bloques.map((b) => {
                      const m = marcaDe(e.id, b.blockNo);
                      const estado = ESTADOS.find((x) => x.valor === m?.status);
                      return (
                        <td key={b.blockNo} className="num" title={m?.comment ?? undefined}>
                          {estado
                            ? <strong style={{ color: estado.color }}>{estado.valor}</strong>
                            : <span className="meta">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="leyenda">
            {ESTADOS.map((e) => (
              <span key={e.valor}><i style={{ background: e.color }} />{e.valor} · {e.etiqueta}</span>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
