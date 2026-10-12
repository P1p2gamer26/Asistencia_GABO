import { useState } from 'react';
import { apiUrl, getSession } from '../../api/client';
import type { ImportResult } from '../../api/contract';

const CARGAS = [
  { clave: 'students',  titulo: 'Estudiantes',
    cabecera: 'documento,primer_nombre,segundo_nombre,primer_apellido,segundo_apellido,curso[,activo]' },
  { clave: 'schedule',  titulo: 'Horario',
    cabecera: 'curso,dia (dia de ciclo 1 a 5),bloque,hora_inicio,hora_fin,materia,correo_docente,aula' },
  { clave: 'guardians', titulo: 'Acudientes',
    cabecera: 'documento_estudiante,nombre_acudiente,correo_acudiente,parentesco' },
] as const;

export default function PanelCarga() {
  const [resultado, setResultado] = useState<Record<string, ImportResult | string>>({});
  const [cargando, setCargando] = useState('');

  async function subir(clave: string, archivo: File) {
    setCargando(clave);
    const datos = new FormData();
    datos.append('file', archivo);
    try {
      const res = await fetch(apiUrl(`/api/admin/import/${clave}`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${getSession()!.token}` },
        body: datos,
      });
      if (!res.ok) throw new Error();
      const cuerpo = (await res.json()) as ImportResult;
      setResultado((r) => ({ ...r, [clave]: cuerpo }));
    } catch {
      setResultado((r) => ({ ...r, [clave]: 'No se pudo cargar el archivo.' }));
    } finally {
      setCargando('');
    }
  }

  return (
    <section>
      <p className="meta">
        Orden de carga: <strong>estudiantes primero</strong>, luego horario, y acudientes
        al final. Los dos ultimos necesitan que el estudiante ya exista.
        Los archivos deben ser CSV codificados en UTF-8. La columna <code>activo</code>{' '}
        de estudiantes es opcional: <code>si</code> activo (o re-activa) y{' '}
        <code>no</code> lo da de baja. Si no viene, queda activo.
        Se lee por posicion: la fila de titulos puede estar en espanol o en ingles,
        pero las columnas deben ir en este orden. Desde Excel: Archivo &gt; Guardar como &gt;
        CSV UTF-8 (delimitado por comas).
      </p>

      {CARGAS.map((c) => {
        const r = resultado[c.clave];
        return (
          <div key={c.clave} className="grafica">
            <h3>{c.titulo}</h3>
            <figcaption><code>{c.cabecera}</code></figcaption>
            <input type="file" accept=".csv,text/csv" disabled={cargando === c.clave}
                   aria-label={`Archivo CSV de ${c.titulo}`}
                   onChange={(e) => {
                     const f = e.target.files?.[0];
                     if (f) void subir(c.clave, f);
                   }} />
            {cargando === c.clave && <p className="meta">Cargando...</p>}
            {typeof r === 'string' && <p role="alert" className="error">{r}</p>}
            {r && typeof r !== 'string' && (
              <>
                <p className="meta">{r.imported} fila(s) cargada(s).</p>
                {r.errors.length > 0 && (
                  <ul className="novedades">
                    {r.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                    {r.errors.length > 20 && <li>...y {r.errors.length - 20} mas</li>}
                  </ul>
                )}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
