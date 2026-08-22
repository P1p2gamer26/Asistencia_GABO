import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../db/local';
import { isSchoolDay } from '../db/local';
import { api } from '../api/client';
import type { Block, StudentDto, Status } from '../api/contract';
import { ESTADOS } from '../api/contract';
import { flushOutbox, markAttendance, pendingCount, startAutoSync } from '../sync/engine';
import BannerEstado from '../components/BannerEstado';
import SelectorFecha from '../components/SelectorFecha';

const hoyISO = () => new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD en hora local

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/** Dia de la semana (1 lunes ... 7 domingo) de una fecha YYYY-MM-DD, en hora local. */
function diaDeLaSemana(fecha: string): number {
  const d = new Date(`${fecha}T00:00`).getDay();
  return d === 0 ? 7 : d;
}

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
  const [motivos, setMotivos] = useState<Record<number, string>>({});
  const [online, setOnline] = useState(navigator.onLine);
  const [alcanzable, setAlcanzable] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [error, setError] = useState('');
  const [avisoCarga, setAvisoCarga] = useState('');

  useEffect(() => {
    void db.blocks.toArray().then(setBlocks);
    void pendingCount().then(setPendientes);
    const detener = startAutoSync((p, a) => { setPendientes(p); setAlcanzable(a); });
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

  // Se llega aqui desde el horario con ?bloque=N. Se preselecciona el curso y el bloque
  // para que el docente no tenga que buscarlos otra vez.
  useEffect(() => {
    const pedido = Number(params.get('bloque'));
    if (!pedido || blocks.length === 0) return;
    const b = blocks.find((x) => x.id === pedido);
    if (!b) return;
    setGrade(b.grade);
    setBlockId(b.id);
  }, [params, blocks]);

  const grados = useMemo(
    () => [...new Set(blocks.map((b) => b.grade))].sort(),
    [blocks],
  );

  // Solo los bloques que ocurren el dia de la fecha elegida. Un bloque del martes no
  // se puede marcar un lunes, asi que ofrecerlo es ofrecer un error: el docente elegia
  // entre cinco opciones identicas y la equivocada guardaba la asistencia en otro dia.
  const bloquesDelGrado = useMemo(
    () => blocks
      .filter((b) => b.grade === grade && b.weekday === diaDeLaSemana(fecha))
      .sort((a, b) => a.blockNo - b.blockNo),
    [blocks, grade, fecha],
  );

  useEffect(() => {
    if (!grade) { setStudents([]); return; }
    void db.students.where('grade').equals(grade).toArray()
      .then((lista) => setStudents(lista.sort((a, b) => a.fullName.localeCompare(b.fullName))));
  }, [grade]);

  useEffect(() => {
    // La lista de bloques depende del dia: si el elegido ya no esta, se limpia.
    if (blockId !== null && !bloquesDelGrado.some((b) => b.id === blockId)) {
      setBlockId(null);
    }
  }, [bloquesDelGrado, blockId]);

  // Al abrir un bloque se pinta lo que realmente hay registrado. La cola local no puede
  // ser la unica memoria: se vacia al sincronizar, y a partir de ahi la pantalla mostraba
  // todo en "P" aunque hubiera faltas guardadas. Enviar entonces las sobrescribia.
  useEffect(() => {
    if (!blockId) { setMarcas({}); setMotivos({}); setAvisoCarga(''); return; }

    let vigente = true;
    (async () => {
      const nuevasMarcas: Record<number, Status> = {};
      const nuevosMotivos: Record<number, string> = {};

      // 1. Lo que el servidor tiene guardado.
      try {
        const guardados = await api.get<{ studentId: number; status: Status; comment?: string }[]>(
          `/api/attendance?blockId=${blockId}&date=${fecha}`);
        for (const g of guardados) {
          nuevasMarcas[g.studentId] = g.status;
          if (g.comment) nuevosMotivos[g.studentId] = g.comment;
        }
        if (vigente) setAvisoCarga('');
      } catch {
        if (vigente) {
          setAvisoCarga('Sin conexion no se puede comprobar lo ya registrado: '
                      + 'puede que no vea todo lo que hay guardado.');
        }
      }

      // 2. Encima, lo que aun no ha salido del telefono: es mas reciente.
      const pendientesLocales = await db.outbox.where('classDate').equals(fecha).toArray();
      for (const r of pendientesLocales) {
        if (r.scheduleBlockId !== blockId) continue;
        nuevasMarcas[r.studentId] = r.status;
        if (r.comment) nuevosMotivos[r.studentId] = r.comment;
      }

      if (!vigente) return;
      setMarcas(nuevasMarcas);
      setMotivos(nuevosMotivos);
    })();

    return () => { vigente = false; };
  }, [blockId, fecha]);

  async function marcar(studentId: number, status: Status) {
    if (!blockId) return;
    try {
      await markAttendance({ studentId, scheduleBlockId: blockId, classDate: fecha, status });
      setMarcas((prev) => ({ ...prev, [studentId]: status }));
      if (status === 'P') {
        // Un motivo de tardanza en alguien que llego a tiempo confunde al acudiente.
        setMotivos((prev) => {
          const { [studentId]: _, ...resto } = prev;
          return resto;
        });
      }
      setPendientes(await pendingCount());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar');
    }
  }

  /**
   * Registra el curso completo y lo sincroniza.
   *
   * Antes solo viajaban los estudiantes a los que el docente habia pulsado un boton,
   * aunque la pantalla mostrara la "P" resaltada para todos: de un curso de 40 con 3
   * faltas se guardaban 3 filas y los 37 presentes no existian en la base. El estado
   * efectivo de cada uno es el que se ve en pantalla, y eso es lo que se envia.
   */
  async function enviar() {
    if (!blockId || !lectivo || students.length === 0) return;
    setError('');
    try {
      for (const s of students) {
        await markAttendance({
          studentId: s.id,
          scheduleBlockId: blockId,
          classDate: fecha,
          status: marcas[s.id] ?? 'P',
          comment: motivos[s.id] ?? '',
        });
      }
      const { pending, alcanzable: hay } = await flushOutbox();
      setPendientes(pending);
      setAlcanzable(hay);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar');
    }
  }

  return (
    <main className="card">
      <BannerEstado online={online} alcanzable={alcanzable} pendientes={pendientes} onSincronizar={enviar} />

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
            <option key={b.id} value={b.id}>
              {b.blockNo}. {b.subject} ({b.startTime}) · {DIAS[b.weekday % 7]}
            </option>
          ))}
        </select>

        <SelectorFecha valor={fecha} onChange={setFecha} max={hoyISO()} />
      </div>

      {error && <p role="alert" className="error">{error}</p>}
      {avisoCarga && <p className="banner no-lectivo" role="status">{avisoCarga}</p>}

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
                           aria-label={`Motivo para ${s.fullName}`}
                           placeholder="Motivo (opcional)"
                           value={motivos[s.id] ?? ''}
                           onChange={(ev) =>
                             setMotivos((prev) => ({ ...prev, [s.id]: ev.target.value }))} />
                  )}
                </li>
              ))}
            </ul>
          )}

      {blockId !== null && lectivo && students.length > 0 && (
        <p className="meta">
          Se registraran los {students.length} estudiantes del curso. Los que no haya
          cambiado quedan como presentes.
        </p>
      )}

      <button type="button" onClick={() => void enviar()}
              disabled={blockId === null || !lectivo || students.length === 0}>
        Enviar asistencia ({students.length})
      </button>
    </main>
  );
}
