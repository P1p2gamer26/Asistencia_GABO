import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { clearSession, getSession } from '../api/client';
import Escudo from './Escudo';
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

        <button type="button" className="secundario"
                onClick={() => { clearSession(); location.href = '/login'; }}>
          Cerrar sesion
        </button>
      </nav>
    </>
  );
}
