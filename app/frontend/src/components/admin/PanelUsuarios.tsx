import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { AdminUser, Role } from '../../api/contract';

const ROLES: Role[] = ['ADMIN', 'COORDINADOR', 'DOCENTE', 'ACUDIENTE'];

type PanelUsuariosProps = {
  onAsignarHorario?: (docente: AdminUser) => void;
};

export default function PanelUsuarios({ onAsignarHorario }: PanelUsuariosProps) {
  const [usuarios, setUsuarios] = useState<AdminUser[]>([]);
  const [filtro, setFiltro] = useState<Role | ''>('');
  const [busqueda, setBusqueda] = useState('');
  const [nuevo, setNuevo] = useState({ email: '', fullName: '', role: 'DOCENTE' as Role });
const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [docenteCreado, setDocenteCreado] = useState<AdminUser | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [edicion, setEdicion] = useState({ fullName: '', role: 'DOCENTE' as Role });

  async function cargar() {
    setError('');
    const q = [filtro && `role=${filtro}`, busqueda && `query=${encodeURIComponent(busqueda)}`]
      .filter(Boolean).join('&');
    try {
      setUsuarios(await api.get<AdminUser[]>(`/api/admin/users${q ? `?${q}` : ''}`));
    } catch {
      setError('No se pudo cargar la lista.');
    }
  }

  useEffect(() => { void cargar(); }, [filtro]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setAviso(''); setDocenteCreado(null);
    try {
      const u = await api.post<AdminUser>('/api/admin/users', nuevo);
      if (u.role === 'DOCENTE') setDocenteCreado(u);
      else setAviso(`Creado ${u.email}. Contrasena temporal: cambiar123`);
      setNuevo({ email: '', fullName: '', role: 'DOCENTE' });
      await cargar();
    } catch {
      setError('No se pudo crear. ¿Ya existe ese correo?');
    }
  }

  async function alternarActivo(u: AdminUser) {
    setError(''); setAviso('');
    try {
      await api.put(`/api/admin/users/${u.id}`,
        { fullName: u.fullName, role: u.role, active: !u.active });
      await cargar();
    } catch {
      setError('No se pudo actualizar.');
    }
  }

  async function resetear(u: AdminUser) {
    setError(''); setAviso('');
    try {
      const r = await api.post<{ temporaryPassword: string }>(
        `/api/admin/users/${u.id}/reset-password`, {});
      setAviso(`Contrasena de ${u.email} restablecida a: ${r.temporaryPassword}`);
    } catch {
      setError('No se pudo restablecer la contrasena.');
    }
  }

  function iniciarEdicion(u: AdminUser) {
    setEditandoId(u.id);
    setEdicion({ fullName: u.fullName, role: u.role });
  }

  async function guardarEdicion(u: AdminUser) {
    setError(''); setAviso('');
    try {
      await api.put(`/api/admin/users/${u.id}`,
        { fullName: edicion.fullName, role: edicion.role, active: u.active });
      setAviso(`Guardado: ${edicion.fullName} (${edicion.role}).`);
      setEditandoId(null);
      await cargar();
    } catch {
      setError('No se pudo guardar el perfil.');
    }
  }

  return (
    <section>
      <form className="filtros" onSubmit={crear}>
        <label htmlFor="ne">Correo</label>
        <input id="ne" type="email" required value={nuevo.email}
               onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
        <label htmlFor="nn">Nombre</label>
        <input id="nn" required value={nuevo.fullName}
               onChange={(e) => setNuevo({ ...nuevo, fullName: e.target.value })} />
        <label htmlFor="nr">Rol</label>
        <select id="nr" value={nuevo.role}
                onChange={(e) => setNuevo({ ...nuevo, role: e.target.value as Role })}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="submit" style={{ gridColumn: '1 / -1' }}>Crear usuario</button>
      </form>

      {aviso && <p className="banner pendiente" role="status">{aviso}</p>}
      {docenteCreado && (
        <section className="card" role="region" aria-label="Siguientes pasos">
          <h2>Docente creado: {docenteCreado.fullName} ({docenteCreado.email})</h2>
          <p>Contrasena temporal: cambiar123. El sistema le pide cambiarla en el primer ingreso.</p>
          <ol>
            <li>Asignarle sus bloques en la pestana Horario (curso, dia de ciclo 1-5, bloque, materia, aula). Sin bloques el docente entra pero no ve clases para tomar asistencia.</li>
            <li>Comprobar que el calendario escolar tenga los dias lectivos del periodo (pestana Calendario); el horario se aplica solo sobre dias lectivos y el dia de ciclo vigente.</li>
            <li>Entregarle el correo y la clave temporal.</li>
          </ol>
          <div className="leyenda">
            <button type="button" onClick={() => onAsignarHorario?.(docenteCreado)}>Asignar horario ahora</button>
            <button type="button" className="secundario" onClick={() => setDocenteCreado(null)}>Saltar por ahora</button>
          </div>
        </section>
      )}
      {error && <p role="alert" className="error">{error}</p>}

      <div className="leyenda" style={{ marginTop: 16 }}>
        <select aria-label="Filtrar por rol" value={filtro}
                onChange={(e) => setFiltro(e.target.value as Role | '')}>
          <option value="">Todos los roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input aria-label="Buscar" placeholder="Buscar por nombre o correo"
               value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <button type="button" className="secundario" onClick={() => void cargar()}>Buscar</button>
      </div>

      {/* Caja con scroll propio: con 1200 acudientes la lista empujaba todo (y "Cerrar
          sesion") hasta el fondo de la pagina. */}
      <div className="tabla-scroll" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>{['Nombre', 'Correo', 'Rol', 'Estado', 'Acciones'].map((h) => (
              <th key={h} style={{ position: 'sticky', top: 0, background: 'var(--superficie)',
                                   boxShadow: 'inset 0 -1px 0 var(--rejilla)' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                {editandoId === u.id ? (
                  <>
                    <td>
                      <input aria-label={`Editar nombre de ${u.fullName}`} value={edicion.fullName}
                             onChange={(e) => setEdicion({ ...edicion, fullName: e.target.value })} />
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <select aria-label={`Editar rol de ${u.fullName}`} value={edicion.role}
                              onChange={(e) => setEdicion({ ...edicion, role: e.target.value as Role })}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>{u.active ? 'Activo' : 'Inactivo'}</td>
                    <td>
                      <button type="button" className="secundario"
                              style={{ minHeight: 32, padding: '4px 10px', marginRight: 6 }}
                              onClick={() => void guardarEdicion(u)}>
                        Guardar
                      </button>
                      <button type="button" className="secundario"
                              style={{ minHeight: 32, padding: '4px 10px' }}
                              onClick={() => setEditandoId(null)}>
                        Cancelar
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                <td>{u.fullName}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.active ? 'Activo' : 'Inactivo'}</td>
                <td>
                  <button type="button" className="secundario"
                          style={{ minHeight: 32, padding: '4px 10px', marginRight: 6 }}
                          onClick={() => iniciarEdicion(u)}>
                    Editar
                  </button>
                  <button type="button" className="secundario"
                          style={{ minHeight: 32, padding: '4px 10px', marginRight: 6 }}
                          onClick={() => void alternarActivo(u)}>
                    {u.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button type="button" className="secundario"
                          style={{ minHeight: 32, padding: '4px 10px' }}
                          onClick={() => void resetear(u)}>
                    Restablecer clave
                  </button>
                </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
