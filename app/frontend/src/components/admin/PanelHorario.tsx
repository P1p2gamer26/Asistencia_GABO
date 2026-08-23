import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { AdminUser, ScheduleBlockAdmin } from '../../api/contract';

type Materia = { id: number; name: string };

const VACIO = {
  grade: '', weekday: 1, blockNo: 1, startTime: '', endTime: '',
  subjectId: '', teacherId: '', room: '',
};

export default function PanelHorario() {
  const [bloques, setBloques] = useState<ScheduleBlockAdmin[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [docentes, setDocentes] = useState<AdminUser[]>([]);
  const [filtroGrado, setFiltroGrado] = useState('');
  const [filtroDocente, setFiltroDocente] = useState('');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function cargar() {
    setError('');
    const q = [
      filtroGrado && `grade=${encodeURIComponent(filtroGrado)}`,
      filtroDocente && `teacherId=${filtroDocente}`,
    ].filter(Boolean).join('&');
    try {
      setBloques(await api.get<ScheduleBlockAdmin[]>(`/api/admin/schedule${q ? `?${q}` : ''}`));
    } catch {
      setError('No se pudo cargar el horario.');
    }
  }

  useEffect(() => { void cargar(); }, [filtroGrado, filtroDocente]);

  useEffect(() => {
    void (async () => {
      try {
        setMaterias(await api.get<Materia[]>('/api/admin/schedule/subjects'));
        setDocentes(await api.get<AdminUser[]>('/api/admin/users?role=DOCENTE'));
      } catch {
        setError('No se pudieron cargar materias o docentes.');
      }
    })();
  }, []);

  function iniciarEdicion(b: ScheduleBlockAdmin) {
    setEditandoId(b.id);
    setForm({
      grade: b.grade, weekday: b.weekday, blockNo: b.blockNo,
      startTime: b.startTime, endTime: b.endTime,
      subjectId: String(b.subjectId), teacherId: String(b.teacherId), room: b.room ?? '',
    });
  }

  function cancelar() {
    setEditandoId(null);
    setForm(VACIO);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setAviso('');
    const cuerpo = {
      grade: form.grade, weekday: Number(form.weekday), blockNo: Number(form.blockNo),
      startTime: form.startTime, endTime: form.endTime,
      subjectId: Number(form.subjectId), teacherId: Number(form.teacherId),
      room: form.room || null,
    };
    try {
      if (editandoId != null) {
        await api.put(`/api/admin/schedule/${editandoId}`, cuerpo);
        setAviso('Bloque actualizado.');
      } else {
        await api.post('/api/admin/schedule', cuerpo);
        setAviso('Bloque creado.');
      }
      cancelar();
      await cargar();
    } catch (err) {
      // El mensaje del backend dice con que choca (docente o aula), no basta un
      // "conflicto" generico: quien edita necesita saber a que clase mover.
      setError(err instanceof Error ? err.message : 'No se pudo guardar el bloque.');
    }
  }

  async function borrar(b: ScheduleBlockAdmin) {
    setError(''); setAviso('');
    try {
      await api.delete(`/api/admin/schedule/${b.id}`);
      setAviso('Bloque borrado.');
      await cargar();
    } catch (err) {
      // Un bloque con asistencia registrada no se borra: el backend explica
      // cuantos registros lo impiden, no basta con fallar en silencio.
      setError(err instanceof Error ? err.message : 'No se pudo borrar el bloque.');
    }
  }

  return (
    <section>
      <form className="filtros" onSubmit={guardar}>
        <label htmlFor="hg">Curso</label>
        <input id="hg" required value={form.grade}
               onChange={(e) => setForm({ ...form, grade: e.target.value })} />
        <label htmlFor="hd">Dia (1=lunes .. 6=sabado)</label>
        <input id="hd" type="number" min={1} max={6} required value={form.weekday}
               onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })} />
        <label htmlFor="hb">Bloque</label>
        <input id="hb" type="number" min={1} required value={form.blockNo}
               onChange={(e) => setForm({ ...form, blockNo: Number(e.target.value) })} />
        <label htmlFor="hi">Hora inicio</label>
        <input id="hi" type="time" required value={form.startTime}
               onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
        <label htmlFor="hf">Hora fin</label>
        <input id="hf" type="time" required value={form.endTime}
               onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
        <label htmlFor="hm">Materia</label>
        <select id="hm" required value={form.subjectId}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
          <option value="">Seleccione</option>
          {materias.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label htmlFor="ht">Docente</label>
        <select id="ht" required value={form.teacherId}
                onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
          <option value="">Seleccione</option>
          {docentes.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
        </select>
        <label htmlFor="ha">Aula (opcional)</label>
        <input id="ha" value={form.room}
               onChange={(e) => setForm({ ...form, room: e.target.value })} />
        <button type="submit" style={{ gridColumn: '1 / -1' }}>
          {editandoId != null ? 'Guardar cambios' : 'Crear bloque'}
        </button>
        {editandoId != null && (
          <button type="button" className="secundario" style={{ gridColumn: '1 / -1' }}
                  onClick={cancelar}>
            Cancelar edicion
          </button>
        )}
      </form>

      {aviso && <p className="banner pendiente" role="status">{aviso}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <div className="leyenda" style={{ marginTop: 16 }}>
        <input aria-label="Filtrar por curso" placeholder="Filtrar por curso"
               value={filtroGrado} onChange={(e) => setFiltroGrado(e.target.value)} />
        <select aria-label="Filtrar por docente" value={filtroDocente}
                onChange={(e) => setFiltroDocente(e.target.value)}>
          <option value="">Todos los docentes</option>
          {docentes.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
        </select>
      </div>

      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Curso</th><th>Dia</th><th>Bloque</th><th>Hora</th><th>Materia</th>
              <th>Docente</th><th>Aula</th><th>Creado por</th><th>Modificado por</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {bloques.map((b) => (
              <tr key={b.id}>
                <td>{b.grade}</td>
                <td>{b.weekday}</td>
                <td>{b.blockNo}</td>
                <td>{b.startTime}-{b.endTime}</td>
                <td>{b.subject}</td>
                <td>{b.teacherName}</td>
                <td>{b.room ?? ''}</td>
                <td>{b.createdByName ? `${b.createdByName} (${b.createdAt?.slice(0, 10)})` : 'Sin registro'}</td>
                <td>{b.updatedByName ? `${b.updatedByName} (${b.updatedAt?.slice(0, 10)})` : 'Sin registro'}</td>
                <td>
                  <button type="button" className="secundario"
                          style={{ minHeight: 32, padding: '4px 10px', marginRight: 6 }}
                          onClick={() => iniciarEdicion(b)}>
                    Editar
                  </button>
                  <button type="button" className="secundario"
                          style={{ minHeight: 32, padding: '4px 10px' }}
                          onClick={() => void borrar(b)}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
