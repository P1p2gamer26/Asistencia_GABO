import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { clearSession, getSession } from '../api/client';
import { downloadBootstrap } from '../sync/engine';
import { db } from '../db/local';
import Escudo from './Escudo';
import type { Role } from '../api/contract';

const PERSONAL: Role[] = ['ADMIN', 'COORDINADOR', 'DOCENTE'];

/**
 * Control de sincronizacion: unico punto desde el que el personal del colegio
 * puede llenar la copia local (bloques, estudiantes, calendario). Antes solo
 * vivia en Home, que ya no es alcanzable desde ningun rol -- sin esto no hay
 * forma de descargar datos desde la interfaz.
 */
function ActualizarDatos() {
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
    <div className="menu-sync">
      <button type="button" onClick={() => void actualizar()}>Actualizar datos</button>
      <small className="meta">
        Datos descargados: {ultima ? new Date(ultima).toLocaleString('es-CO') : 'nunca'}
      </small>
      {error && <small role="alert" className="error">{error}</small>}
    </div>
  );
}

type Destino = { a: string; texto: string; roles: Role[] };

/** El orden es el de la jornada: primero lo que se usa a diario. */
const DESTINOS: Destino[] = [
  { a: '/',            texto: 'Inicio',         roles: ['ADMIN', 'COORDINADOR', 'DOCENTE'] },
  { a: '/',            texto: 'Mis hijos',      roles: ['ACUDIENTE'] },
  { a: '/asistencia',  texto: 'Asistencia a clase', roles: ['ADMIN', 'COORDINADOR', 'DOCENTE'] },
  { a: '/horario',     texto: 'Horario',        roles: ['ADMIN', 'COORDINADOR', 'DOCENTE'] },
  { a: '/calendario',  texto: 'Calendario',     roles: ['ADMIN', 'COORDINADOR', 'DOCENTE', 'ACUDIENTE'] },
  { a: '/ingreso',     texto: 'Ingreso al colegio', roles: ['ADMIN', 'COORDINADOR', 'DOCENTE'] },
  { a: '/consultas',   texto: 'Consultas',      roles: ['ADMIN', 'COORDINADOR', 'DOCENTE'] },
  { a: '/dashboard',   texto: 'Tablero',        roles: ['ADMIN', 'COORDINADOR'] },
  { a: '/admin',       texto: 'Administracion', roles: ['ADMIN'] },
];

export default function Menu() {
  const [abierto, setAbierto] = useState(false);
  const sesion = getSession();
  if (!sesion) return null;

  const visibles = DESTINOS.filter((d) => d.roles.includes(sesion.role));

  return (
    <>
      <button type="button" className="menu-boton secundario"
              aria-label={abierto ? 'Cerrar menu' : 'Abrir menu'}
              onClick={() => setAbierto(!abierto)}>
        {abierto ? 'Cerrar menu' : 'Abrir menu'}
      </button>

      <nav className="menu" role="navigation" data-abierto={String(abierto)}
           aria-label="Secciones">
        <div className="menu-marca">
          <Escudo size={40} />
          <div>
            <strong>Asistencia GGM</strong>
            <small>{sesion.fullName}</small>
          </div>
        </div>

        <ul>
          {visibles.map((d) => (
            <li key={d.a}>
              <NavLink to={d.a} end={d.a === '/'}
                       className={({ isActive }) => (isActive ? 'activo' : undefined)}
                       onClick={() => setAbierto(false)}>
                {d.texto}
              </NavLink>
            </li>
          ))}
        </ul>

        {PERSONAL.includes(sesion.role) && <ActualizarDatos />}

        <button type="button" className="secundario"
                onClick={() => { clearSession(); location.href = '/login'; }}>
          Cerrar sesion
        </button>
      </nav>
    </>
  );
}
