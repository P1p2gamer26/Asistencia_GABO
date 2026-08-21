import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession, clearSession } from '../api/client';
import type { PendingBlock } from '../api/contract';
import { downloadBootstrap } from '../sync/engine';
import { db } from '../db/local';
import BotonInstalar from '../components/BotonInstalar';
import Escudo from '../components/Escudo';

export default function Home() {
  const session = getSession()!;
  const [ultima, setUltima] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pendientes, setPendientes] = useState<PendingBlock[]>([]);

  useEffect(() => {
    void db.meta.get('lastBootstrap').then((m) => setUltima(m?.value ?? null));
    // Sin senal no hay forma de saber que falta: se calcula en el servidor. Se calla.
    void api.get<PendingBlock[]>('/api/reports/pending-today').then(setPendientes).catch(() => {});
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
      <header className="marca">
        <Escudo />
        <div>
          <span className="eyebrow">{session.role}</span>
          <h1>Asistencia GGM</h1>
        </div>
      </header>
      <p>Bienvenido, {session.fullName}</p>
      {pendientes.length > 0 && (
        <section className="pendientes-hoy">
          <h2>Falta tomar asistencia hoy</h2>
          <ul>
            {pendientes.map((b) => (
              <li key={b.blockId}>
                <Link to={`/asistencia?grade=${encodeURIComponent(b.grade)}&blockId=${b.blockId}`}>
                  Bloque {b.blockNo} · {b.grade} · {b.subject}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <nav className="acciones">
        <Link className="boton" to="/asistencia">
          Asistencia a clase<small>Marcar P, T, F o E por bloque. Funciona sin senal.</small>
        </Link>
        <Link className="boton" to="/ingreso">
          Ingreso al colegio<small>Escanear el carnet en la porteria.</small>
        </Link>
        <Link className="boton" to="/consultas">
          Consultas<small>Resumen por curso e informes en Excel.</small>
        </Link>
        {(session.role === 'COORDINADOR' || session.role === 'ADMIN') && (
          <Link className="boton" to="/dashboard">
            Tablero<small>Tasa de asistencia, ausentes de hoy y tendencia.</small>
          </Link>
        )}
        {session.role === 'ADMIN' && (
          <Link className="boton" to="/admin">
            Administracion<small>Usuarios, calendario academico y carga de CSV.</small>
          </Link>
        )}
      </nav>
      <p className="meta">
        Datos descargados: {ultima ? new Date(ultima).toLocaleString('es-CO') : 'nunca'}
      </p>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="pie">
        <button type="button" onClick={() => void actualizar()}>Actualizar datos</button>
        <BotonInstalar />
        <button type="button" className="secundario"
                onClick={() => { clearSession(); location.href = '/login'; }}>
          Cerrar sesion
        </button>
      </div>
    </main>
  );
}
