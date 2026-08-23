import { useEffect, useState } from 'react';
import { api, apiUrl, getSession } from '../api/client';

type Fila = {
  studentId: number; documentId: string; fullName: string; grade: string;
  present: number; late: number; absent: number; evasion: number; schoolDays: number;
  // Ausente cuando no hay ninguna marca en el periodo: no se inventa un 0% ni un 100%.
  attendanceRate?: number;
};

type DiaNoLectivoConMarcas = { fecha: string; tipo: string; marcas: number };

export default function Consultas() {
  const [grade, setGrade] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tipo, setTipo] = useState('resumen');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [error, setError] = useState('');
  const [cursos, setCursos] = useState<string[]>([]);
  const [diasNoLectivos, setDiasNoLectivos] = useState<DiaNoLectivoConMarcas[]>([]);

  // Los cursos salen de un resumen de un solo dia: es la consulta mas barata que
  // devuelve la lista completa, y evita inventar un endpoint nuevo para esto.
  useEffect(() => {
    const hoy = new Date().toLocaleDateString('en-CA');
    api.get<Fila[]>(`/api/reports/summary?from=${hoy}&to=${hoy}`)
       .then((filas) => setCursos([...new Set(filas.map((f) => f.grade))].sort()))
       .catch(() => {});   // sin conexion se queda vacio y el aviso lo explica
  }, []);

  const query = () =>
    `grade=${encodeURIComponent(grade)}&from=${from}&to=${to}`;

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
      const res = await fetch(apiUrl(`/api/reports/excel?${query()}&tipo=${tipo}`), {
        headers: { Authorization: `Bearer ${getSession()!.token}` },
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tipo}_${grade || 'todos'}_${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo descargar el informe.');
    }
  }

  return (
    <main className="card ancha">
      <h1>Consultas</h1>
      <div className="filtros">
        <label htmlFor="curso">Curso</label>
        <select id="curso" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">Seleccione un curso...</option>
          {cursos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label htmlFor="desde">Desde</label>
        <input id="desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label htmlFor="hasta">Hasta</label>
        <input id="hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
      {error && <p role="alert" className="error">{error}</p>}
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
    </main>
  );
}
