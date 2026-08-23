import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../api/client';

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

export default function InicioDocente() {
  const [dia, setDia] = useState<Dia | null>(null);
  const [error, setError] = useState('');
  const [pendientes, setPendientes] = useState<ListasPendientes | null>(null);
  const [errorPendientes, setErrorPendientes] = useState('');

  useEffect(() => {
    api.get<Dia>('/api/schedule/my-day')
       .then(setDia)
       .catch(() => setError('No se pudo consultar el dia. Requiere conexion.'));
    api.get<ListasPendientes>('/api/reports/pending-recent')
       .then(setPendientes)
       .catch(() => setErrorPendientes('No se pudieron consultar las listas pendientes.'));
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
