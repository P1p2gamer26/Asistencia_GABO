import { useState } from 'react';
import { getSession } from '../../api/client';
import type { ImportResult } from '../../api/contract';

const CARGAS = [
  { clave: 'students',  titulo: 'Estudiantes',
    cabecera: 'document_id,first_name,middle_name,last_name,second_surname,grade' },
  { clave: 'schedule',  titulo: 'Horario',
    cabecera: 'grade,weekday,block_no,start_time,end_time,subject,teacher_email' },
  { clave: 'guardians', titulo: 'Acudientes',
    cabecera: 'document_id,guardian_name,guardian_email,relationship' },
] as const;

export default function PanelCarga() {
  const [resultado, setResultado] = useState<Record<string, ImportResult | string>>({});
  const [cargando, setCargando] = useState('');

  async function subir(clave: string, archivo: File) {
    setCargando(clave);
    const datos = new FormData();
    datos.append('file', archivo);
    try {
      const res = await fetch(`/api/admin/import/${clave}`, {
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
        Los archivos deben ser CSV codificados en UTF-8.
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
