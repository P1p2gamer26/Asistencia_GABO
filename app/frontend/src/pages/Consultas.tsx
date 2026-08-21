import { useState } from 'react';
import { api, getSession } from '../api/client';

type Fila = {
  studentId: number; documentId: string; fullName: string; grade: string;
  present: number; late: number; absent: number; evasion: number; schoolDays: number;
};

export default function Consultas() {
  const [grade, setGrade] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tipo, setTipo] = useState('resumen');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [error, setError] = useState('');

  const query = () =>
    `grade=${encodeURIComponent(grade)}&from=${from}&to=${to}`;

  async function buscar() {
    setError('');
    try {
      setFilas(await api.get<Fila[]>(`/api/reports/summary?${query()}`));
    } catch {
      setError('No se pudo consultar. Requiere conexion.');
    }
  }

  async function descargar() {
    setError('');
    try {
      const res = await fetch(`/api/reports/excel?${query()}&tipo=${tipo}`, {
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
    <main className="card">
      <h1>Consultas</h1>
      <div className="filtros">
        <label htmlFor="curso">Curso</label>
        <input id="curso" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="601 (vacio = todos)" />
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
      <button type="button" onClick={() => void buscar()} disabled={!from || !to}>Consultar</button>
      <button type="button" className="secundario" onClick={() => void descargar()} disabled={!from || !to}>
        Descargar Excel
      </button>
      {error && <p role="alert" className="error">{error}</p>}
      {filas.length > 0 && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>Estudiante</th><th>Curso</th><th className="num">Lectivos</th>
                  <th className="num">P</th><th className="num">T</th>
                  <th className="num">F</th><th className="num">E</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.studentId}>
                  <td>{f.fullName}</td><td>{f.grade}</td>
                  <td className="num">{f.schoolDays}</td>
                  <td className="num">{f.present}</td><td className="num">{f.late}</td>
                  <td className="num">{f.absent}</td><td className="num">{f.evasion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
