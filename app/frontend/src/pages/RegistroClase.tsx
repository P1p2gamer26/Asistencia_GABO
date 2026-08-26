import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { AttendanceDetalle, Status } from '../api/contract';
import { ESTADOS } from '../api/contract';

/**
 * El salon completo de un bloque y una fecha: los estudiantes con lo que quedo
 * registrado, quien lo tomo y quien lo corrigio, y el editar/borrar de cada uno.
 *
 * Vive en su propia URL (/asistencia/:blockId/:fecha) y no dentro de la planilla:
 * asi se puede enlazar, compartir con coordinacion y volver con el boton del
 * navegador, que es como la gente espera moverse entre "la lista" y "un salon".
 */
export default function RegistroClase() {
  const { blockId, fecha } = useParams();
  // Curso, bloque y materia viajan en la URL: el detalle no los trae y pedir el
  // horario entero para pintar un titulo seria una llamada de mas.
  const [params] = useSearchParams();
  const [registros, setRegistros] = useState<AttendanceDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [editando, setEditando] = useState<string | null>(null);
  const [edStatus, setEdStatus] = useState<Status>('P');
  const [edComment, setEdComment] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setRegistros(await api.get<AttendanceDetalle[]>(
        `/api/attendance/detalle?blockId=${blockId}&date=${fecha}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar lo registrado');
    } finally {
      setCargando(false);
    }
  }, [blockId, fecha]);

  useEffect(() => { void cargar(); }, [cargar]);

  useEffect(() => {
    const cambio = () => setOnline(navigator.onLine);
    window.addEventListener('online', cambio);
    window.addEventListener('offline', cambio);
    return () => {
      window.removeEventListener('online', cambio);
      window.removeEventListener('offline', cambio);
    };
  }, []);

  async function guardarEdicion(id: string) {
    try {
      await api.put(`/api/attendance/${id}`, { status: edStatus, comment: edComment || undefined });
      setEditando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo editar');
    }
  }

  async function borrar(r: AttendanceDetalle) {
    if (!window.confirm(`¿Borrar la asistencia de ${r.fullName}? Queda registro de quien la borro.`)) return;
    try {
      await api.delete(`/api/attendance/${r.id}`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar');
    }
  }

  // El conteo por estado es lo primero que se mira al abrir un salon.
  const conteo = ESTADOS.map((e) => ({
    ...e, n: registros.filter((r) => r.status === e.valor).length,
  }));

  return (
    <main className="card ancha">
      <p className="meta"><Link to="/asistencia">← Volver a asistencia</Link></p>

      <span className="eyebrow">Asistencia registrada</span>
      <h1>
        Curso {params.get('curso') ?? ''}
        {params.get('bloque') ? ` · Bloque ${params.get('bloque')}` : ''}
        {params.get('materia') ? ` · ${params.get('materia')}` : ''}
      </h1>
      <p className="meta">{new Date(`${fecha}T00:00`).toLocaleDateString('es-CO',
        { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      {!cargando && registros.length > 0 && (
        <p className="meta resumen-salon">
          {registros.length} estudiantes ·{' '}
          {conteo.filter((c) => c.n > 0)
                 .map((c) => `${c.n} ${c.etiqueta.toLowerCase()}`).join(' · ')}
        </p>
      )}

      {!online && (
        <p className="meta">
          Sin conexion se puede consultar lo ya sincronizado, pero editar o borrar
          requiere conexion: no se guardaria en una cola local.
        </p>
      )}
      {cargando && <p className="meta">Cargando...</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {!cargando && registros.length === 0 && !error && (
        <p className="meta">No hay nada registrado en el servidor para este bloque y fecha.</p>
      )}

      <ul className="registros-lista">
        {registros.map((r) => (
          <li key={r.id}>
            {editando === r.id ? (
              <div className="registro-edicion">
                <strong>{r.fullName}</strong>
                <select value={edStatus} aria-label={`Nuevo estado de ${r.fullName}`}
                        onChange={(e) => setEdStatus(e.target.value as Status)}>
                  {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.etiqueta}</option>)}
                </select>
                <input type="text" maxLength={280} placeholder="Motivo (opcional)"
                       aria-label={`Motivo editado de ${r.fullName}`}
                       value={edComment} onChange={(e) => setEdComment(e.target.value)} />
                <div className="registro-acciones">
                  <button type="button" onClick={() => void guardarEdicion(r.id)} disabled={!online}>
                    Guardar
                  </button>
                  <button type="button" className="secundario" onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="nombre">
                  <strong>{r.fullName}</strong>
                  <small>ID {r.documentId}</small>
                </div>
                <span className={`estado-punto ${r.status}`}>
                  {ESTADOS.find((e) => e.valor === r.status)?.etiqueta}
                </span>
                {r.comment && <small className="meta">{r.comment}</small>}
                <small className="meta">
                  Registro: {r.recordedByName ?? 'sin registro'} · {new Date(r.recordedAt).toLocaleString('es-CO')}
                </small>
                {r.editedAt && (
                  <small className="meta">
                    Editado: {r.editedByName ?? 'sin registro'} · {new Date(r.editedAt).toLocaleString('es-CO')}
                  </small>
                )}
                <div className="registro-acciones">
                  <button type="button" className="secundario" disabled={!online}
                          onClick={() => {
                            setEditando(r.id);
                            setEdStatus(r.status);
                            setEdComment(r.comment ?? '');
                          }}>
                    Editar
                  </button>
                  <button type="button" className="secundario" disabled={!online}
                          onClick={() => void borrar(r)}>
                    Borrar
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
