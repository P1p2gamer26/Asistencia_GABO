import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ESTADOS } from '../api/contract';

type Bloque = { blockNo: number; subject: string | null; teacherName: string | null; startTime: string | null; endTime: string | null };
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
// La API manda la hora como "07:00:00": se muestra solo HH:mm.
const franja = (inicio: string | null, fin: string | null) =>
  inicio && fin ? `${inicio.slice(0, 5)} – ${fin.slice(0, 5)}` : '—';
const rotulo = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

/** Comentarios que los docentes dejaron hoy, agrupados por bloque. Sin comentarios, lo dice. */
function ComentariosDia({ bloques, estudiantes, marcas, fecha }: {
  bloques: Bloque[]; estudiantes: { id: number; fullName: string }[]; marcas: Marca[]; fecha: string;
}) {
  const nombre = (id: number) => estudiantes.find((e) => e.id === id)?.fullName ?? `Estudiante ${id}`;
  const conComentario = marcas.filter((m) => m.classDate === fecha && m.comment && m.comment.trim() !== '');
  if (conComentario.length === 0) {
    return <p className="meta">Sin comentarios hoy en este curso.</p>;
  }
  return (
    <ul className="novedad-lista">
      {bloques.map((b) => {
        const delBloque = conComentario.filter((m) => m.blockNo === b.blockNo);
        if (delBloque.length === 0) return null;
        return delBloque.map((m) => (
          <li key={`${b.blockNo}-${m.studentId}`} className="novedad-item">
            <strong>Bloque {b.blockNo}</strong>
            <span className="meta"> · {franja(b.startTime, b.endTime)}</span>
            {b.subject ? <span className="meta"> · {b.subject}</span> : null}
            {b.teacherName ? <span className="meta"> · {b.teacherName}</span> : null}
            <br />
            <span>{nombre(m.studentId)}:</span> {m.comment}
          </li>
        ));
      })}
    </ul>
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

      {datos && bloques.length === 0 && (
        <p className="meta">{dia?.descripcion ?? 'Sin clases este dia.'}</p>
      )}

      {datos && bloques.length > 0 && (
        <>
          <h3>Comentarios del dia</h3>
          <ComentariosDia bloques={bloques} estudiantes={datos.estudiantes} marcas={datos.marcas} fecha={fecha} />
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
