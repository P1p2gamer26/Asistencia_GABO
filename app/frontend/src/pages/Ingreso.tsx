import { useEffect, useRef, useState } from 'react';
import { db } from '../db/local';
import { api, OfflineError } from '../api/client';
import { abrirCamara, scanOnce } from '../scan/scanner';

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

  async function registrar(documentId: string) {
    const estudiante = await db.students.where('documentId').equals(documentId).first();
    setUltimo(estudiante ? estudiante.fullName : `Carnet ${documentId} no reconocido`);
    await db.entryOutbox.put({ id: crypto.randomUUID(), documentId, scannedAt: new Date().toISOString() });
    await enviar();
  }

  async function enviar() {
    const cola = await db.entryOutbox.toArray();
    setPendientes(cola.length);
    if (cola.length === 0) return;
    try {
      const res = await api.post<{ accepted: number; rejected: { id: string; reason: string }[] }>(
        '/api/entry/sync',
        { entries: cola.map(({ name, error, ...e }) => e) },
      );
      const malos = new Map(res.rejected.map((r) => [r.id, r.reason]));
      for (const e of cola) {
        if (malos.has(e.id)) await db.entryOutbox.update(e.id, { error: malos.get(e.id) });
        else await db.entryOutbox.delete(e.id);
      }
    } catch (e) {
      if (!(e instanceof OfflineError)) throw e;   // sin senal: la cola se queda para despues
    }
    setPendientes(await db.entryOutbox.count());
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
