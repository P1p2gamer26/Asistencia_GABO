import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useDebounce } from '../../lib/useDebounce';
import type { AdminUser, ScheduleBlockAdmin } from '../../api/contract';

type Materia = { id: number; name: string };

const VACIO = {
  grade: '', weekday: 1, blockNo: 1, startTime: '', endTime: '',
  subjectId: '', teacherId: '', room: '',
};

type PanelHorarioProps = {
  docenteInicial?: AdminUser;
};

export default function PanelHorario({ docenteInicial }: PanelHorarioProps) {
  const [bloques, setBloques] = useState<ScheduleBlockAdmin[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [docentes, setDocentes] = useState<AdminUser[]>([]);
  const [filtroGrado, setFiltroGrado] = useState('');
  const [filtroDocente, setFiltroDocente] = useState(() =>
    docenteInicial ? String(docenteInicial.id) : '');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState(() => ({
    ...VACIO,
    teacherId: docenteInicial ? String(docenteInicial.id) : '',
  }));
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

  // Mismo problema que en la pagina Horario: el filtro es un campo de texto, cada
  // tecla lanzaba una consulta y la respuesta de un filtro viejo podia pisar a la del
  // nuevo. useDebounce corta el trafico; `vigente` corta la carrera.
  const gradoBuscado = useDebounce(filtroGrado);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      setError('');
      const q = [
        gradoBuscado && `grade=${encodeURIComponent(gradoBuscado)}`,
        filtroDocente && `teacherId=${filtroDocente}`,
      ].filter(Boolean).join('&');
      try {
        const b = await api.get<ScheduleBlockAdmin[]>(`/api/admin/schedule${q ? `?${q}` : ''}`);
        if (vigente) setBloques(b);
      } catch {
        if (vigente) setError('No se pudo cargar el horario.');
      }
    })();
    return () => { vigente = false; };
  }, [gradoBuscado, filtroDocente]);

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
    setError(''); setAviso('');    const cuerpo = {
      grade: form.grade, weekday: Number(form.weekday), blockNo: Number(form.blockNo),
      startTime: form.startTime, endTime: form.endTime,
      subjectId: Number(form.subjectId), teacherId: Number(form.teacherId),
      room: form.room || undefined,
    };
    try {
      if (editandoId != null) {
        const r = await api.cambiar('PUT', `/api/admin/schedule/${editandoId}`, cuerpo, `Editar bloque horario ${editandoId}`);
        if (r.encolado) {
          setBloques(bloques.map((b) => b.id === editandoId ? { ...b, ...cuerpo } as ScheduleBlockAdmin : b));
        } else {
          setAviso('Bloque actualizado.');
          await cargar();
        }
      } else {
        const r = await api.cambiar('POST', '/api/admin/schedule', cuerpo, `Crear bloque horario ${form.grade} D${form.weekday} B${form.blockNo}`);
        if (r.encolado) {
          cancelar();
        } else {
          setAviso('Bloque creado.');
          cancelar();
          await cargar();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el bloque.');
    }
  }

  async function borrar(b: ScheduleBlockAdmin) {
    setError(''); setAviso('');    try {
      const r = await api.cambiar('DELETE', `/api/admin/schedule/${b.id}`, undefined, `Borrar bloque horario ${b.id}`);
      if (r.encolado) {
        setBloques(bloques.filter((bl) => bl.id !== b.id));
      } else {
        setAviso('Bloque borrado.');
        await cargar();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar el bloque.');
    }
  }

  return (
    <section>
      <form className="filtros" onSubmit={guardar}>
        <label htmlFor="hg">Curso</label>
        <input id="hg" required value={form.grade}
               onChange={(e) => setForm({ ...form, grade: e.target.value })} />
        <label htmlFor="hd">Dia de ciclo (1 a 5)</label>
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
        <button type="submit" className="ocupa-todo">
          {editandoId != null ? 'Guardar cambios' : 'Crear bloque'}
        </button>
        {editandoId != null && (
          <button type="button" className="secundario ocupa-todo"
                  onClick={cancelar}>
            Cancelar edicion
          </button>
        )}
      </form>

      {aviso && <p className="banner pendiente" role="status">{aviso}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <div className="leyenda mt-4">
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
                <td>Dia {b.weekday}</td>
                <td>{b.blockNo}</td>
                <td>{b.startTime}-{b.endTime}</td>
                <td>{b.subject}</td>
                <td>{b.teacherName}</td>
                <td>{b.room ?? ''}</td>
                <td>{b.createdByName ? `${b.createdByName} (${b.createdAt?.slice(0, 10)})` : 'Sin registro'}</td>
                <td>{b.updatedByName ? `${b.updatedByName} (${b.updatedAt?.slice(0, 10)})` : 'Sin registro'}</td>
                <td>
                  <button type="button" className="secundario chico"
                          onClick={() => iniciarEdicion(b)}>
                    Editar
                  </button>
                  <button type="button" className="secundario chico"
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
