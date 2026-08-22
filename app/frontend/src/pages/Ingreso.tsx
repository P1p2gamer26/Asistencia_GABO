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
    const control = new AbortController();
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await abrirCamara(video.current!);
        while (!control.signal.aborted) {
          const codigo = await scanOnce(video.current!, control.signal);
          await registrar(codigo);
          await new Promise((r) => setTimeout(r, 1500));   // evita releer el mismo carnet
        }
      } catch (e) {
        if (!control.signal.aborted) setError('No se pudo abrir la camara. Revise los permisos.');
      }
    })();

    return () => {
      control.abort();
      stream?.getTracks().forEach((t) => t.stop());
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
