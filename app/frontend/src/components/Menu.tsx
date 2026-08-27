import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { clearSession, getSession } from '../api/client';
import { downloadBootstrap } from '../sync/engine';
import Escudo from './Escudo';
import Version from './Version';
import type { Role } from '../api/contract';

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

  // Si falla, no se avisa aqui: la franja de estado ya dice si la copia local sirve o
  // no, que es lo que el docente necesita saber. Tragarse el error sin mas dejaba la
  // aplicacion vacia y muda.
  useEffect(() => {
    void downloadBootstrap().catch(() => {
      // Sin conexion es lo normal al abrir en el salon; lo anormal lo dice BarraOffline.
    });
  }, []);

  if (!sesion) return null;

  const visibles = DESTINOS.filter((d) => d.roles.includes(sesion.role));

  return (
    <>
      {/* Barra superior solo en movil: lo esencial y las tres rayitas. El menu completo
          se despliega desde la izquierda como cajon. */}
      <header className="barra-movil">
        <button type="button" className="hamburguesa" aria-label="Abrir menu"
                aria-expanded={abierto} aria-controls="menu-lateral"
                onClick={() => setAbierto(true)}>
          <span aria-hidden="true">☰</span>
        </button>
        <span className="barra-marca">
          <Escudo size={28} />
          <strong>Asistencia GGM</strong>
        </span>
      </header>

      {/* Fondo oscuro: tocar fuera cierra el cajon. */}
      {abierto && <div className="menu-fondo" onClick={() => setAbierto(false)} />}

      <nav id="menu-lateral" className="menu" role="navigation"
           data-abierto={String(abierto)} aria-label="Secciones">
        <div className="menu-marca">
          <Escudo size={40} />
          <div>
            <strong>Asistencia GGM</strong>
            <small>{sesion.fullName}</small>
          </div>
          <button type="button" className="menu-cerrar" aria-label="Cerrar menu"
                  onClick={() => setAbierto(false)}>×</button>
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

        <Version />
        <button type="button" className="secundario"
                onClick={() => { clearSession(); location.href = '/login'; }}>
          Cerrar sesion
        </button>
      </nav>
    </>
  );
}
