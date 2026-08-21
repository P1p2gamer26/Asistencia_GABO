import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSession, clearSession } from '../api/client';
import { downloadBootstrap } from '../sync/engine';
import { db } from '../db/local';
import BotonInstalar from '../components/BotonInstalar';

export default function Home() {
  const session = getSession()!;
  const [ultima, setUltima] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void db.meta.get('lastBootstrap').then((m) => setUltima(m?.value ?? null));
  }, []);

  async function actualizar() {
    setError('');
    try {
      await downloadBootstrap();
      setUltima(new Date().toISOString());
    } catch {
      setError('No se pudo actualizar. Intente con mejor senal.');
    }
  }

  return (
    <main className="card">
      <h1>Asistencia GGM</h1>
      <p>Bienvenido, {session.fullName}</p>
      <nav className="acciones">
        <Link className="boton" to="/asistencia">Asistencia a clase</Link>
        <Link className="boton" to="/ingreso">Ingreso al colegio</Link>
        {session.role !== 'DOCENTE' && <Link className="boton" to="/consultas">Consultas</Link>}
      </nav>
      <p className="meta">
        Datos descargados: {ultima ? new Date(ultima).toLocaleString('es-CO') : 'nunca'}
      </p>
      {error && <p role="alert" className="error">{error}</p>}
      <button type="button" onClick={() => void actualizar()}>Actualizar datos</button>
      <BotonInstalar />
      <button type="button" className="secundario"
              onClick={() => { clearSession(); location.href = '/login'; }}>
        Cerrar sesion
      </button>
    </main>
  );
}
