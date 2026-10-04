import { useState } from 'react';
import PanelUsuarios from '../components/admin/PanelUsuarios';
import PanelEstudiantes from '../components/admin/PanelEstudiantes';
import PanelCalendario from '../components/admin/PanelCalendario';
import PanelCarga from '../components/admin/PanelCarga';
import PanelHorario from '../components/admin/PanelHorario';
import type { AdminUser } from '../api/contract';

const PESTANAS = [
  { clave: 'usuarios',   titulo: 'Usuarios' },
  { clave: 'estudiantes', titulo: 'Estudiantes' },
  { clave: 'calendario', titulo: 'Calendario' },
  { clave: 'horario',    titulo: 'Horario' },
  { clave: 'carga',      titulo: 'Carga de datos' },
] as const;

export default function Admin() {
  const [activa, setActiva] = useState<string>('usuarios');
  const [docenteHorario, setDocenteHorario] = useState<AdminUser | undefined>();

  function asignarHorario(docente: AdminUser) {
    setDocenteHorario(docente);
    setActiva('horario');
  }

  return (
    <main className="card ancha">
      <h1>Administracion</h1>
      <div className="pestanas mb-4" role="tablist">
        {PESTANAS.map((p) => (
          <button key={p.clave} type="button" role="tab"
                  aria-selected={activa === p.clave}
                  onClick={() => setActiva(p.clave)}>
            {p.titulo}
          </button>
        ))}
      </div>
      {activa === 'usuarios' && <PanelUsuarios onAsignarHorario={asignarHorario} />}
      {activa === 'estudiantes' && <PanelEstudiantes />}
      {activa === 'calendario' && <PanelCalendario />}
      {activa === 'horario' && <PanelHorario docenteInicial={docenteHorario} />}
      {activa === 'carga' && <PanelCarga />}
    </main>
  );
}
