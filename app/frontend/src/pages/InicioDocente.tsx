import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../api/client';
import { db } from '../db/local';

type Bloque = {
  id: number; blockNo: number; grade: string; subject: string; room?: string;
  startTime: string; endTime: string; marcados: number; estudiantes: number;
};
type Dia = { lectivo: boolean; fecha: string; motivo: string | null; bloques: Bloque[] };
// Una fila por dia+curso, no por bloque: un curso al que nunca se le toma
// asistencia mete varias filas casi identicas por dia y entierra los pendientes
// reales de otros cursos.
type PendienteAgrupado = { fecha: string; grade: string; listas: number };
type ListasPendientes = { grupos: PendienteAgrupado[]; totalGrupos: number };

/**
 * Lo tomado, lo que va a medias y lo que falta se dicen distinto a proposito.
 * El caso peligroso es el de en medio: parece hecho y no lo esta.
 */
function estado(b: Bloque) {
  if (b.marcados === 0) return { texto: 'sin tomar', clase: 'falta' };
  if (b.marcados < b.estudiantes) {
    return { texto: `${b.marcados} de ${b.estudiantes}`, clase: 'medias' };
  }
  return { texto: `${b.marcados} de ${b.estudiantes}`, clase: 'listo' };
}

/** Marcas de ese bloque y fecha que siguen en la cola del telefono, sin subir. */
async function enCola(blockId: number, fecha: string): Promise<number> {
  try {
    return await db.outbox.where('scheduleBlockId').equals(blockId)
      .and((r) => r.classDate === fecha).count();
  } catch {
    return 0;   // sin almacenamiento local
  }
}

export default function InicioDocente() {
  const [dia, setDia] = useState<Dia | null>(null);
  const [error, setError] = useState('');
  const [pendientes, setPendientes] = useState<ListasPendientes | null>(null);
  const [errorPendientes, setErrorPendientes] = useState('');

  useEffect(() => {
    let montado = true;
    const hoy = new Date().toLocaleDateString('en-CA');
    api.get<Dia>('/api/schedule/my-day')
       .then(async (d) => {
         if (navigator.onLine) {
           if (montado) { setDia(d); }
           return;
         }
         // Sin red, la respuesta es la copia guardada: puede ser de otro dia (entonces se
         // arma con lo local) y no sabe lo marcado despues en este telefono.
         if (d.fecha !== hoy) throw new Error('copia de otro dia');
         const bloques = await Promise.all(d.bloques.map(async (b) =>
           ({ ...b, marcados: Math.max(b.marcados, await enCola(b.id, hoy)) })));
         if (montado) { setDia({ ...d, bloques }); }
       })
       .catch(async () => {
         if (!montado) return;
         const diaLocal = await Promise.resolve().then(() => db.schoolDays.get(hoy)).catch(() => undefined);
         if (!diaLocal) {
           setError('No se pudo consultar el dia. Requiere conexion.');
           return;
         }
         if (diaLocal.dayType !== 'LECTIVO') {
           setDia({ lectivo: false, fecha: hoy, motivo: diaLocal.description ?? null, bloques: [] });
           return;
         }
         const bloques = await db.blocks.where('weekday').equals(diaLocal.cycleDay ?? 0).toArray();
         const conConteo = await Promise.all(bloques
           .sort((a, b) => a.blockNo - b.blockNo)
           .map(async (b) => ({
             id: b.id, blockNo: b.blockNo, grade: b.grade, subject: b.subject, room: b.room,
             startTime: b.startTime, endTime: '',
             marcados: await enCola(b.id, hoy),
             estudiantes: await db.students.where('grade').equals(b.grade).count(),
           })));
         if (!montado) return;
         setDia({ lectivo: true, fecha: hoy, motivo: null, bloques: conConteo });
       });
    api.get<ListasPendientes>('/api/reports/pending-recent')
       .then(setPendientes)
       .catch(() => setErrorPendientes('No se pudieron consultar las listas pendientes.'));
    return () => { montado = false; };
  }, []);

  return (
    <main className="card ancha">
      <h1>Hola, {getSession()?.fullName}</h1>

      {error && <p role="alert" className="error">{error}</p>}
      {!dia && !error && <p className="meta">Cargando...</p>}

      {dia && !dia.lectivo && (
        <p className="aviso-no-lectivo">
          Hoy no hay clase{dia.motivo ? `: ${dia.motivo}` : ''}.
        </p>
      )}

      {dia?.lectivo && dia.bloques.length === 0 && (
        <p className="meta">
          No tiene clases asignadas hoy. Si cree que es un error, avise a coordinacion.
        </p>
      )}

      {dia?.lectivo && dia.bloques.length > 0 && (
        <ul className="dia-bloques">
          {dia.bloques.map((b) => {
            const e = estado(b);
            return (
              <li key={b.id} className={`bloque ${e.clase}`}>
                <span className="hora">{b.startTime}</span>
                <span className="donde">
                  <strong>{b.grade}</strong> {b.subject}
                  {b.room && <em className="aula"> en {b.room}</em>}
                </span>
                <span className="marcado">{e.texto}</span>
                {b.marcados < b.estudiantes && (
                  <Link to={`/asistencia?bloque=${b.id}`} className="tomar-lista">
                    Tomar la lista de {b.grade}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Siempre visible, sea o no dia lectivo: es lo unico accionable que le queda
          al docente en un fin de semana o festivo. */}
      <section className="pendientes-recientes">
        <h2>Listas pendientes</h2>
        {errorPendientes && <p role="alert" className="error">{errorPendientes}</p>}
        {!pendientes && !errorPendientes && <p className="meta">Cargando...</p>}
        {pendientes && pendientes.grupos.length === 0 && (
          <p className="meta">No tiene listas pendientes de dias anteriores.</p>
        )}
        {pendientes && pendientes.grupos.length > 0 && (
          <>
            <ul className="dia-bloques">
              {pendientes.grupos.map((g) => (
                <li key={`${g.fecha}-${g.grade}`} className="bloque falta">
                  <span className="hora">{g.fecha}</span>
                  <span className="donde">
                    <strong>{g.grade}</strong> {g.listas} {g.listas === 1 ? 'lista' : 'listas'} sin tomar
                  </span>
                  <Link to={`/asistencia?grade=${g.grade}&fecha=${g.fecha}`}
                        className="tomar-lista">
                    Tomar la lista de {g.grade}
                  </Link>
                </li>
              ))}
            </ul>
            {/* Nunca se recorta en silencio: si hay mas de los que se muestran, se dice
                cuantos quedan afuera. */}
            {pendientes.totalGrupos > pendientes.grupos.length && (
              <p className="meta">
                Y {pendientes.totalGrupos - pendientes.grupos.length} mas.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
