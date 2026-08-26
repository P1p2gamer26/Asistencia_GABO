import { useEffect, useRef, useState } from 'react';
import { db } from '../db/local';
import { api, OfflineError } from '../api/client';
import { abrirCamara, scanOnce } from '../scan/scanner';
import { parseCarnet } from '../scan/carnet';

export default function Ingreso() {
  const video = useRef<HTMLVideoElement>(null);
  const [ultimo, setUltimo] = useState('');
  const [error, setError] = useState('');
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    let control: AbortController | null = null;
    let stream: MediaStream | null = null;
    let corriendo = false;

    function detener() {
      control?.abort();
      control = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      corriendo = false;
    }

    async function iniciar() {
      if (corriendo || document.hidden || !video.current) return;
      corriendo = true;
      control = new AbortController();
      const sig = control.signal;
      try {
        stream = await abrirCamara(video.current);
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
    const cola = await db.entryOutbox.toArray();
    setPendientes(cola.length);
    if (cola.length === 0) return { nombres: {}, rechazos: {}, alcanzable: true };

    try {
      const res = await api.post<{
        accepted: number;
        rejected: { id: string; reason: string }[];
        names: Record<string, string>;
      }>('/api/entry/sync', { entries: cola.map(({ name, error, ...e }) => e) });

      const rechazos: Record<string, string> = {};
      for (const r of res.rejected) rechazos[r.id] = r.reason;

      for (const e of cola) {
        if (rechazos[e.id]) await db.entryOutbox.update(e.id, { error: rechazos[e.id] });
        else await db.entryOutbox.delete(e.id);
      }
      setPendientes(await db.entryOutbox.count());
      return { nombres: res.names ?? {}, rechazos, alcanzable: true };
    } catch (e) {
      if (!(e instanceof OfflineError)) throw e;
      return { nombres: {}, rechazos: {}, alcanzable: false };
    }
  }

  return (
    <main className="card">
      <h1>Ingreso al colegio</h1>
      <p>Acerque el carnet del estudiante a la camara.</p>
      <video ref={video} className="camara" muted playsInline />
      {ultimo && <p className="ultimo" role="status">{ultimo}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="meta">{pendientes} ingreso(s) sin enviar</p>
    </main>
  );
}
