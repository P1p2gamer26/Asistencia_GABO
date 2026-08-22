import type { ReactNode } from 'react';
import Menu from './Menu';

/** Armazon de las pantallas con sesion: barra lateral fija y el contenido al lado. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="armazon">
      <Menu />
      <div className="contenido">{children}</div>
    </div>
  );
}
