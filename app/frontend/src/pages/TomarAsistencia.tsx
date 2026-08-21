import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../db/local';
import { isSchoolDay } from '../db/local';
import type { Block, StudentDto, Status } from '../api/contract';
import { ESTADOS } from '../api/contract';
import { flushOutbox, markAttendance, pendingCount, startAutoSync } from '../sync/engine';
import BannerEstado from '../components/BannerEstado';
import SelectorFecha from '../components/SelectorFecha';

const hoyISO = () => new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD en hora local

export default function TomarAsistencia() {
  // Los pendientes de hoy en el inicio enlazan aqui con el curso y el bloque ya elegidos.
  const [params] = useSearchParams();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [students, setStudents] = useState<StudentDto[]>([]);
  const [grade, setGrade] = useState(params.get('grade') ?? '');
  const [blockId, setBlockId] = useState<number | null>(
    params.get('blockId') ? Number(params.get('blockId')) : null,
  );
  const [fecha, setFecha] = useState(hoyISO());
  const [lectivo, setLectivo] = useState(true);
  const [marcas, setMarcas] = useState<Record<number, Status>>({});
  const [online, setOnline] = useState(navigator.onLine);
  const [pendientes, setPendientes] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    void db.blocks.toArray().then(setBlocks);
    void pendingCount().then(setPendientes);
    const detener = startAutoSync(setPendientes);
    const cambio = () => setOnline(navigator.onLine);
    window.addEventListener('online', cambio);
    window.addEventListener('offline', cambio);
    return () => {
      detener();
      window.removeEventListener('online', cambio);
      window.removeEventListener('offline', cambio);
    };
  }, []);

  useEffect(() => { void isSchoolDay(fecha).then(setLectivo); }, [fecha]);

  const grados = useMemo(
    () => [...new Set(blocks.map((b) => b.grade))].sort(),
    [blocks],
  );

  const bloquesDelGrado = useMemo(
    () => blocks.filter((b) => b.grade === grade),
    [blocks, grade],
  );

  useEffect(() => {
    if (!grade) { setStudents([]); return; }
    void db.students.where('grade').equals(grade).toArray()
      .then((lista) => setStudents(lista.sort((a, b) => a.fullName.localeCompare(b.fullName))));
  }, [grade]);

  // Al cambiar de curso, bloque o fecha se recupera lo ya marcado localmente para ese contexto.
  useEffect(() => {
    if (!blockId) { setMarcas({}); return; }
    void db.outbox.where('classDate').equals(fecha).toArray().then((pend) => {
      const previas: Record<number, Status> = {};
      for (const r of pend) if (r.scheduleBlockId === blockId) previas[r.studentId] = r.status;
      setMarcas(previas);
    });
  }, [blockId, fecha]);

  async function marcar(studentId: number, status: Status) {
    if (!blockId) return;
    try {
      await markAttendance({ studentId, scheduleBlockId: blockId, classDate: fecha, status });
      setMarcas((prev) => ({ ...prev, [studentId]: status }));
      setPendientes(await pendingCount());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar');
    }
  }

  async function comentar(studentId: number, comment: string) {
    if (!blockId) return;
    try {
      await markAttendance({
        studentId, scheduleBlockId: blockId, classDate: fecha,
        status: marcas[studentId] ?? 'P', comment,
      });
      setPendientes(await pendingCount());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar');
    }
  }

  async function enviar() {
    const { pending } = await flushOutbox();
    setPendientes(pending);
  }

  return (
    <main className="card">
      <BannerEstado online={online} pendientes={pendientes} onSincronizar={enviar} />

      <span className="eyebrow">Planilla del dia</span>
      <h1>Asistencia a clase</h1>

      <div className="filtros">
        <label htmlFor="grado">Curso</label>
        <select id="grado" value={grade} onChange={(e) => { setGrade(e.target.value); setBlockId(null); }}>
          <option value="">Seleccione...</option>
          {grados.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>

        <label htmlFor="bloque">Bloque</label>
        <select id="bloque" value={blockId ?? ''} disabled={!grade}
                onChange={(e) => setBlockId(Number(e.target.value) || null)}>
          <option value="">Seleccione...</option>
          {bloquesDelGrado.map((b) => (
            <option key={b.id} value={b.id}>{b.blockNo}. {b.subject} ({b.startTime})</option>
          ))}
        </select>

        <SelectorFecha valor={fecha} onChange={setFecha} max={hoyISO()} />
      </div>

      {error && <p role="alert" className="error">{error}</p>}

      {!lectivo
        ? <p className="meta">Elija un dia lectivo para tomar asistencia.</p>
        : blockId === null
          ? <p>Elija curso y bloque para tomar la asistencia.</p>
          : (
            <ul className="estudiantes">
              {students.map((s) => (
                <li key={s.id}>
                  <div className="nombre">
                    <strong>{s.fullName}</strong>
                    <small>ID {s.documentId}</small>
                  </div>
                  <div className="estados" role="group" aria-label={`Estado de ${s.fullName}`}>
                    {ESTADOS.map((e) => (
                      <button key={e.valor} type="button"
                              className={`estado ${e.valor} ${(marcas[s.id] ?? 'P') === e.valor ? 'activo' : ''}`}
                              aria-pressed={(marcas[s.id] ?? 'P') === e.valor}
                              title={e.etiqueta}
                              onClick={() => void marcar(s.id, e.valor)}>
                        {e.valor}
                      </button>
                    ))}
                  </div>
                  {(marcas[s.id] === 'T' || marcas[s.id] === 'F') && (
                    <input className="comentario" type="text" maxLength={280}
                           placeholder="Motivo (opcional)"
                           onBlur={(ev) => void comentar(s.id, ev.target.value)} />
                  )}
                </li>
              ))}
            </ul>
          )}

      <button type="button" onClick={() => void enviar()} disabled={pendientes === 0 || !lectivo}>
        Enviar asistencia ({pendientes})
      </button>
    </main>
  );
}
