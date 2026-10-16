import type { ReactNode } from 'react';
import Menu from './Menu';
import BarraOffline from './BarraOffline';
import AvisoServidorLento from './AvisoServidorLento';

/** Armazon de las pantallas con sesion: barra lateral fija y el contenido al lado. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="armazon">
      <Menu />
      <div className="contenido">
        <AvisoServidorLento />
        <BarraOffline />
        {children}
      </div>
    </div>
  );
}
