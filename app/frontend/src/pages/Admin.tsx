import { useState } from 'react';
import PanelUsuarios from '../components/admin/PanelUsuarios';
import PanelCalendario from '../components/admin/PanelCalendario';
import PanelCarga from '../components/admin/PanelCarga';

const PESTANAS = [
  { clave: 'usuarios',   titulo: 'Usuarios' },
  { clave: 'calendario', titulo: 'Calendario' },
  { clave: 'carga',      titulo: 'Carga de datos' },
] as const;

export default function Admin() {
  const [activa, setActiva] = useState<string>('usuarios');

  return (
    <main className="card">
      <h1>Administracion</h1>
      <div className="leyenda" role="tablist" style={{ marginBottom: 16 }}>
        {PESTANAS.map((p) => (
          <button key={p.clave} type="button" role="tab"
                  aria-selected={activa === p.clave}
                  className={activa === p.clave ? undefined : 'secundario'}
                  style={{ minHeight: 36, padding: '6px 12px' }}
                  onClick={() => setActiva(p.clave)}>
            {p.titulo}
          </button>
        ))}
      </div>
      {activa === 'usuarios' && <PanelUsuarios />}
      {activa === 'calendario' && <PanelCalendario />}
      {activa === 'carga' && <PanelCarga />}
    </main>
  );
}
