import { useEffect, useRef, useState } from 'react';
import { db } from '../db/local';
import { api } from '../api/client';
import { flushEntries } from '../sync/engine';
import { abrirCamara, scanOnce, tieneLinterna, alternarLinterna } from '../scan/scanner';
import { parseCarnet } from '../scan/carnet';

// Consejos que rotan mientras no se lee nada: cubren las dos causas tipicas de que un
// QR pequeno no entre, la distancia y la luz.
const PISTAS = [
  'Encuadra el carnet dentro del recuadro',
  'Acercalo un poco mas',
  'Alejalo hasta que el codigo entre completo',
  'Con mas luz: prueba la linterna',
  'Mantenlo quieto un segundo',
];

type Ficha = {
  studentId: number; documentId: string; fullName: string; grade: string;
  phone?: string; address?: string; eps?: string;
  entryId?: string; scannedAt?: string;
};
type EntradaDia = { id: string; documentId: string; fullName: string; grade: string; scannedAt: string };

const horaLocal = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
const horaInput = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function Ingreso() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [ultimo, setUltimo] = useState('');
  const [error, setError] = useState('');
  const [pendientes, setPendientes] = useState(0);
  const [pista, setPista] = useState(0);
  const [linternaOk, setLinternaOk] = useState(false);
  const [linterna, setLinterna] = useState(false);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [entradas, setEntradas] = useState<EntradaDia[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [horaEdit, setHoraEdit] = useState('');

  async function cargarDia() {
    try { setEntradas(await api.get<EntradaDia[]>('/api/entry/dia')); } catch { /* sin conexion */ }
  }
  async function cargarFicha(documentId: string) {
    try { setFicha(await api.get<Ficha>(`/api/entry/ficha?documentId=${encodeURIComponent(documentId)}`)); }
    catch { setFicha(null); }
  }
  async function borrarIngreso(id: string) {
    if (!confirm('Borrar este ingreso?')) return;
    try {
      await api.delete(`/api/entry/${id}`);
      setFicha((f) => (f && f.entryId === id ? { ...f, entryId: undefined, scannedAt: undefined } : f));
      await cargarDia();
    } catch { setError('No se pudo borrar el ingreso.'); }
  }
  async function guardarHora(en: EntradaDia) {
    const [hh, mm] = horaEdit.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    const base = new Date(en.scannedAt);
    base.setHours(hh, mm, 0, 0);
    try {
      await api.put(`/api/entry/${en.id}`, { scannedAt: base.toISOString() });
      setEditId(null);
      await cargarDia();
    } catch { setError('No se pudo cambiar la hora.'); }
  }

  useEffect(() => { void cargarDia(); }, []);

  // Los consejos rotan solos para no dejar al usuario adivinando por que no lee.
  useEffect(() => {
    const t = setInterval(() => setPista((p) => (p + 1) % PISTAS.length), 2800);
    return () => clearInterval(t);
  }, []);

  async function alternarLuz() {
    if (!stream.current) return;
    try {
      await alternarLinterna(stream.current, !linterna);
      setLinterna(!linterna);
    } catch { setLinternaOk(false); }
  }

  useEffect(() => {
    let control: AbortController | null = null;
    let corriendo = false;

    function detener() {
      control?.abort();
      control = null;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setLinternaOk(false);
      setLinterna(false);
      corriendo = false;
    }

    async function iniciar() {
      if (corriendo || document.hidden || !video.current) return;
      corriendo = true;
      control = new AbortController();
      const sig = control.signal;
      try {
        stream.current = await abrirCamara(video.current);
        setLinternaOk(tieneLinterna(stream.current));
        while (!sig.aborted) {
          try {
            const codigo = await scanOnce(video.current, sig);
            await registrar(codigo);
            await new Promise((r) => setTimeout(r, 1500));   // evita releer el mismo carnet
          } catch (e) {
            if (sig.aborted) break;
            // El video se detuvo un momento (otra app, giro de pantalla): se reintenta.
            // Si la camara quedo caida de verdad, se sale al aviso de abajo.
            if (!video.current || video.current.readyState < 2) throw e;
            await new Promise((r) => setTimeout(r, 400));
          }
        }
      } catch (e) {
        if (!sig.aborted) setError('No se pudo abrir la camara. Revise los permisos.');
      } finally {
        corriendo = false;
      }
    }

    // Al bloquear/apagar la pantalla el navegador pausa el video y el bucle se queda
    // esperando un fotograma que no llega. Se suelta la camara al ocultarse y se reabre
    // al volver: el usuario espera seguir escaneando, no una pantalla congelada.
    function alCambiarVisibilidad() {
      if (document.hidden) detener();
      else void iniciar();
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    void iniciar();

    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      detener();
    };
  }, []);

  async function registrar(textoQr: string) {
    const carnet = parseCarnet(textoQr);
    if (!carnet) {
      setError('No se pudo leer el carnet. Intente de nuevo, mas cerca y con mas luz.');
      return;
    }
    setError('');
    const documentId = carnet.documentId;
    // El carnet puede estar desactualizado (traslado de curso, reimpresion vieja).
    // Se registra igual -manda la base- pero la docente tiene que verlo.
    const local = await db.students.where('documentId').equals(documentId).first();
    if (local && carnet.curso && !carnet.curso.includes(local.grade)) {
      setError(`Revisar: el carnet dice "${carnet.curso}" y la base dice "${local.grade}".`);
    }

    const id = crypto.randomUUID();
    await db.entryOutbox.put({ id, documentId, scannedAt: new Date().toISOString() });

    const { nombres, rechazos, alcanzable } = await enviar();

    // Reconocido: mostrar su ficha y refrescar el listado del dia.
    if (!rechazos[id]) { void cargarFicha(documentId); void cargarDia(); }

    if (rechazos[id]) {
      setUltimo('');
      setError(`Carnet ${documentId} no registrado. Revise el carnet del estudiante.`);
      return;
    }
    if (nombres[id]) {
      setUltimo(nombres[id]);          // el servidor confirmo y dio el nombre
      return;
    }
    if (!alcanzable) {
      // Sin conexion: el ingreso queda guardado. Decir "no reconocido" haria que lo
      // escanearan tres veces pensando que fallo.
      setUltimo(local
        ? local.fullName
        : `Carnet ${documentId} registrado, se verificara al sincronizar`);
      return;
    }
    setUltimo(`Carnet ${documentId} registrado`);
  }

  /**
   * Envia la cola y devuelve lo que el servidor dijo de cada ingreso.
   * El servidor resuelve el nombre aunque el dispositivo no tenga a ese estudiante en
   * su copia local, que es el caso normal en la porteria: quien esta ahi no dicta
   * cursos, asi que su copia local esta vacia.
   */
  async function enviar(): Promise<{
    nombres: Record<string, string>;
    rechazos: Record<string, string>;
    alcanzable: boolean;
  }> {
    const r = await flushEntries();
    setPendientes(r.pending);

    // flushEntries deja los rechazos escritos en entryOutbox.error; se leen de ahi
    // porque la respuesta del motor no trae el detalle por id, solo el conteo.
    const conError = await db.entryOutbox.toArray();
    const rechazos = Object.fromEntries(
      conError.filter((e) => e.error).map((e) => [e.id, e.error!]));

    return { nombres: r.nombres, rechazos, alcanzable: r.alcanzable };
  }

  return (
    <main className="card">
      <h1>Ingreso al colegio</h1>
      <p>Acerque el carnet del estudiante a la camara.</p>

      <div className="escaner">
        <video ref={video} className="camara" muted playsInline />
        {/* Recuadro guia: el usuario mete el QR ahi dentro. */}
        <div className="recuadro" aria-hidden="true" />
      </div>

      <p className="pista" aria-live="polite">{PISTAS[pista]}</p>
      {linternaOk && (
        <button type="button" className="secundario"
                aria-pressed={linterna} onClick={() => void alternarLuz()}>
          {linterna ? 'Apagar linterna' : 'Encender linterna'}
        </button>
      )}

      {ultimo && <p className="ultimo" role="status">✓ {ultimo}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="meta">{pendientes} ingreso(s) sin enviar</p>

      {ficha && (
        <section className="ficha">
          <span className="eyebrow">Ficha del estudiante</span>
          <h2>{ficha.fullName}</h2>
          <dl className="ficha-datos">
            <div><dt>Documento</dt><dd>{ficha.documentId}</dd></div>
            <div><dt>Curso</dt><dd>{ficha.grade}</dd></div>
            <div><dt>Telefono</dt><dd>{ficha.phone || '—'}</dd></div>
            <div><dt>Direccion</dt><dd>{ficha.address || '—'}</dd></div>
            <div><dt>EPS</dt><dd>{ficha.eps || '—'}</dd></div>
            <div><dt>Ingreso hoy</dt><dd>{ficha.scannedAt ? horaLocal(ficha.scannedAt) : 'Sin ingreso'}</dd></div>
          </dl>
          <p className="meta">La ficha es solo de consulta; los datos se editan en Administracion.</p>
        </section>
      )}

      <section className="ingresos-dia">
        <span className="eyebrow">Ingresos de hoy</span>
        <h2>Registrados ({entradas.length})</h2>
        {entradas.length === 0 && <p className="meta">Aun no hay ingresos hoy.</p>}
        <ul className="registros-lista">
          {entradas.map((en) => (
            <li key={en.id}>
              <div className="nombre">
                <strong>{en.fullName}</strong>
                <small>{en.grade} · {en.documentId}</small>
              </div>
              {editId === en.id ? (
                <div className="acciones-fila">
                  <input type="time" value={horaEdit} aria-label={`Hora de ${en.fullName}`}
                         onChange={(e) => setHoraEdit(e.target.value)} />
                  <button type="button" onClick={() => void guardarHora(en)}>Guardar</button>
                  <button type="button" className="secundario" onClick={() => setEditId(null)}>Cancelar</button>
                </div>
              ) : (
                <div className="acciones-fila">
                  <span className="hora">{horaLocal(en.scannedAt)}</span>
                  <button type="button" className="secundario"
                          onClick={() => { setEditId(en.id); setHoraEdit(horaInput(en.scannedAt)); }}>
                    Editar hora
                  </button>
                  <button type="button" className="secundario"
                          onClick={() => void borrarIngreso(en.id)}>Borrar</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
