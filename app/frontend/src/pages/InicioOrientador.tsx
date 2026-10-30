import { Link } from 'react-router-dom';
import { getSession } from '../api/client';

/** Inicio de orientacion: quien es y que puede hacer. Sin administracion. */
export default function InicioOrientador() {
  const sesion = getSession();
  return (
    <main className="card">
      <span className="eyebrow">Orientacion escolar</span>
      <h1>Hola, {sesion?.fullName}</h1>
      <p className="meta">
        Entras como orientador: puedes tomar asistencia en cualquier curso, revisar el
        horario y el calendario, consultar la asistencia y ver el tablero del colegio.
      </p>
      <p>
        <Link to="/asistencia">Asistencia a clase</Link> · <Link to="/consultas">Consultas</Link>
        {' · '}<Link to="/dashboard">Tablero</Link>
      </p>
    </main>
  );
}
