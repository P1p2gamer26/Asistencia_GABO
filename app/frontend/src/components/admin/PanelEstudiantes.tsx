import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { StudentAdmin } from '../../api/contract';
import { ordenCurso } from '../../lib/ordenCurso';
import { abrirCamara, scanOnce } from '../../scan/scanner';
import { parseCarnet } from '../../scan/carnet';

const VACIO = {
  documentId: '', firstName: '', middleName: '', lastName: '', secondSurname: '', grade: '',
};

/**
 * Del texto del carnet arma el formulario. El reparto del nombre es una conjetura
 * (dos nombres y dos apellidos es lo comun aqui, pero no siempre): por eso solo
 * PRE-LLENA, y el admin corrige antes de crear.
 */
function desglosarCarnet(raw: string): typeof VACIO | null {
  const c = parseCarnet(raw);
  if (!c) return null;
  const t = c.nombre.split(/\s+/).filter(Boolean);
  let firstName = '', middleName = '', lastName = '', secondSurname = '';
  if (t.length >= 4) {
    firstName = t[0]; secondSurname = t[t.length - 1]; lastName = t[t.length - 2];
    middleName = t.slice(1, t.length - 2).join(' ');
  } else if (t.length === 3) { firstName = t[0]; lastName = t[1]; secondSurname = t[2]; }
  else if (t.length === 2) { firstName = t[0]; lastName = t[1]; }
  else if (t.length === 1) { firstName = t[0]; }
  // Curso "Primero - 103" -> el ultimo grupo de 2-3 digitos ("103").
  const mg = c.curso.match(/(\d{2,3})(?!.*\d)/);
  return { documentId: c.documentId, firstName, middleName, lastName, secondSurname,
           grade: mg ? mg[1] : '' };
}

/**
 * Alta, edicion y baja de estudiantes. La carga masiva por Excel sigue estando en su
 * pestana: esto es para el estudiante que llega a mitad de ano o el dato mal escrito,
 * que hoy obligaba a volver a importar el archivo entero.
 */
export default function PanelEstudiantes() {
  const [estudiantes, setEstudiantes] = useState<StudentAdmin[]>([]);
  const [curso, setCurso] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [nuevo, setNuevo] = useState({ ...VACIO });
  const [editando, setEditando] = useState<StudentAdmin | null>(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  // Escaneo de un solo carnet para pre-llenar el formulario de alta.
  useEffect(() => {
    if (!escaneando) return;
    const control = new AbortController();
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await abrirCamara(video.current!);
        const texto = await scanOnce(video.current!, control.signal);
        const datos = desglosarCarnet(texto);
        if (!datos) setScanMsg('No se reconocio la cedula en el carnet. Intenta de nuevo.');
        else {
          setNuevo(datos);
          setScanMsg(`Leido documento ${datos.documentId}. Revisa nombres y curso antes de crear.`);
        }
      } catch {
        if (!control.signal.aborted) setScanMsg('No se pudo abrir la camara. Revisa los permisos.');
      } finally {
        stream?.getTracks().forEach((t) => t.stop());
        setEscaneando(false);
      }
    })();
    return () => { control.abort(); stream?.getTracks().forEach((t) => t.stop()); };
  }, [escaneando]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function cargar() {
    setError('');
    setCargando(true);
    const q = [curso && `grade=${encodeURIComponent(curso)}`,
               busqueda && `query=${encodeURIComponent(busqueda)}`].filter(Boolean).join('&');
    try {
      setEstudiantes(await api.get<StudentAdmin[]>(`/api/admin/students${q ? `?${q}` : ''}`));
    } catch {
      setError('No se pudo cargar la lista. Requiere conexion.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { void cargar(); }, [curso]);   // eslint-disable-line react-hooks/exhaustive-deps

  const cursos = [...new Set(estudiantes.map((e) => e.grade))].sort(ordenCurso);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setAviso('');
    try {
      const s = await api.post<StudentAdmin>('/api/admin/students', nuevo);
      setAviso(`Creado ${s.fullName} en ${s.grade}.`);
      setNuevo({ ...VACIO });
      await cargar();
    } catch {
      setError('No se pudo crear. ¿Ya existe ese numero de documento?');
    }
  }

  async function guardar(s: StudentAdmin) {
    setError(''); setAviso('');
    try {
      await api.put(`/api/admin/students/${s.id}`, {
        firstName: s.firstName, middleName: s.middleName, lastName: s.lastName,
        secondSurname: s.secondSurname, grade: s.grade, active: s.active,
      });
      setEditando(null);
      await cargar();
    } catch {
      setError('No se pudo guardar.');
    }
  }

  async function borrar(s: StudentAdmin) {
    // El aviso dice la verdad de lo que va a pasar: con historial no desaparece.
    if (!window.confirm(
      `¿Dar de baja a ${s.fullName}?\n\n`
      + 'Si ya tiene asistencia registrada NO se borra: queda inactivo y su historial '
      + 'se conserva. Si no tiene ningun registro, se borra definitivamente.')) return;
    setError(''); setAviso('');
    try {
      const r = await api.delete<{ borradoDefinitivo: boolean }>(`/api/admin/students/${s.id}`);
      setAviso(r.borradoDefinitivo
        ? `${s.fullName} se borro definitivamente: no tenia ningun registro.`
        : `${s.fullName} quedo inactivo. Su historial de asistencia se conserva.`);
      await cargar();
    } catch {
      setError('No se pudo dar de baja.');
    }
  }

  return (
    <section>
      <div className="alta-carnet" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        {!escaneando ? (
          <button type="button" className="secundario"
                  onClick={() => { setScanMsg(''); setEscaneando(true); }}>
            Escanear carnet
          </button>
        ) : (
          <>
            <div className="escaner">
              <video ref={video} className="camara" muted playsInline />
              <div className="recuadro" aria-hidden="true" />
            </div>
            <button type="button" className="secundario"
                    onClick={() => setEscaneando(false)}>Cancelar escaneo</button>
          </>
        )}
        {scanMsg && <p className="meta" role="status">{scanMsg}</p>}
      </div>

      <form className="filtros" onSubmit={crear}>
        <label htmlFor="ed">Documento</label>
        <input id="ed" required value={nuevo.documentId}
               onChange={(e) => setNuevo({ ...nuevo, documentId: e.target.value })} />
        <label htmlFor="en">Nombres</label>
        <input id="en" required placeholder="Primer nombre" value={nuevo.firstName}
               onChange={(e) => setNuevo({ ...nuevo, firstName: e.target.value })} />
        <label htmlFor="en2">Segundo nombre</label>
        <input id="en2" value={nuevo.middleName}
               onChange={(e) => setNuevo({ ...nuevo, middleName: e.target.value })} />
        <label htmlFor="ea">Apellido</label>
        <input id="ea" required value={nuevo.lastName}
               onChange={(e) => setNuevo({ ...nuevo, lastName: e.target.value })} />
        <label htmlFor="ea2">Segundo apellido</label>
        <input id="ea2" value={nuevo.secondSurname}
               onChange={(e) => setNuevo({ ...nuevo, secondSurname: e.target.value })} />
        <label htmlFor="ec">Curso</label>
        <input id="ec" required placeholder="6A" value={nuevo.grade}
               onChange={(e) => setNuevo({ ...nuevo, grade: e.target.value })} />
        <button type="submit" style={{ gridColumn: '1 / -1' }}>Crear estudiante</button>
      </form>

      {aviso && <p className="banner pendiente" role="status">{aviso}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <div className="filtros-tablero">
        <label htmlFor="fc">Filtrar por curso</label>
        <select id="fc" value={curso} onChange={(e) => setCurso(e.target.value)}>
          <option value="">Todos</option>
          {cursos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input aria-label="Buscar por nombre o documento" placeholder="Buscar..."
               value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <button type="button" onClick={() => void cargar()}>Buscar</button>
      </div>

      {cargando && <p className="meta">Cargando...</p>}
      {!cargando && estudiantes.length === 0 && (
        <p className="meta">No hay estudiantes que coincidan.</p>
      )}

      <p className="meta">{estudiantes.length} estudiantes</p>

      <ul className="registros-lista" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        {estudiantes.map((s) => (
          <li key={s.id}>
            {editando?.id === s.id ? (
              <div className="registro-edicion">
                <input aria-label={`Nombres de ${s.fullName}`} value={editando.firstName}
                       onChange={(e) => setEditando({ ...editando, firstName: e.target.value })} />
                <input aria-label={`Apellidos de ${s.fullName}`} value={editando.lastName}
                       onChange={(e) => setEditando({ ...editando, lastName: e.target.value })} />
                <input aria-label={`Curso de ${s.fullName}`} value={editando.grade}
                       onChange={(e) => setEditando({ ...editando, grade: e.target.value })} />
                <label>
                  <input type="checkbox" checked={editando.active}
                         onChange={(e) => setEditando({ ...editando, active: e.target.checked })} />
                  {' '}Activo
                </label>
                <div className="registro-acciones">
                  <button type="button" onClick={() => void guardar(editando)}>Guardar</button>
                  <button type="button" className="secundario"
                          onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                <div className="nombre">
                  <strong>{s.fullName}</strong>
                  <small>ID {s.documentId} · curso {s.grade}{s.active ? '' : ' · inactivo'}</small>
                </div>
                <div className="registro-acciones">
                  <button type="button" className="secundario"
                          onClick={() => setEditando(s)}>Editar</button>
                  <button type="button" className="secundario"
                          onClick={() => void borrar(s)}>Dar de baja</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
