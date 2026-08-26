import { useState } from 'react';
import PanelUsuarios from '../components/admin/PanelUsuarios';
import PanelEstudiantes from '../components/admin/PanelEstudiantes';
import PanelCalendario from '../components/admin/PanelCalendario';
import PanelCarga from '../components/admin/PanelCarga';
import PanelHorario from '../components/admin/PanelHorario';

const PESTANAS = [
  { clave: 'usuarios',   titulo: 'Usuarios' },
  { clave: 'estudiantes', titulo: 'Estudiantes' },
  { clave: 'calendario', titulo: 'Calendario' },
  { clave: 'horario',    titulo: 'Horario' },
  { clave: 'carga',      titulo: 'Carga de datos' },
] as const;

export default function Admin() {
  const [activa, setActiva] = useState<string>('usuarios');

  return (
    <main className="card ancha">
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
      {activa === 'estudiantes' && <PanelEstudiantes />}
      {activa === 'calendario' && <PanelCalendario />}
      {activa === 'horario' && <PanelHorario />}
      {activa === 'carga' && <PanelCarga />}
    </main>
  );
}
