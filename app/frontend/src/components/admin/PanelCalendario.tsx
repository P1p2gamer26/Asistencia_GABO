import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { DayType, SchoolDay } from '../../api/contract';

const TIPOS: DayType[] = ['LECTIVO', 'FESTIVO', 'VACACIONES', 'INSTITUCIONAL', 'SUSPENDIDO'];
const hoyISO = () => new Date().toLocaleDateString('en-CA');

export default function PanelCalendario() {
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [dias, setDias] = useState<SchoolDay[]>([]);
  const [error, setError] = useState('');

  async function cargar() {
    setError('');
    try {
      setDias(await api.get<SchoolDay[]>(`/api/calendar/school-days?from=${desde}&to=${hasta}`));
    } catch {
      setError('No se pudo cargar el calendario.');
    }
  }

  useEffect(() => { void cargar(); }, []);

  async function cambiar(dia: SchoolDay, tipo: DayType, motivo: string) {
    setError('');
    try {
      await api.put(`/api/calendar/school-days/${dia.calendarDate}`,
        { dayType: tipo, description: motivo || null });
      await cargar();
    } catch {
      setError('No se pudo actualizar ese dia.');
    }
  }

  return (
    <section>
      <div className="filtros">
        <label htmlFor="cd">Desde</label>
        <input id="cd" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <label htmlFor="ch">Hasta</label>
        <input id="ch" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <button type="button" onClick={() => void cargar()}>Ver rango</button>
      {error && <p role="alert" className="error">{error}</p>}

      <p className="meta">
        Cambiar un dia a algo distinto de LECTIVO impide registrar asistencia ese dia,
        tanto en la aplicacion como en el servidor.
      </p>

      <div className="tabla-scroll">
        <table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th></tr></thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.calendarDate}>
                <td>{new Date(`${d.calendarDate}T00:00`).toLocaleDateString('es-CO',
                      { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                <td>
                  <select aria-label={`Tipo de dia para ${d.calendarDate}`} value={d.dayType}
                          onChange={(e) => void cambiar(d, e.target.value as DayType,
                                                        d.description ?? '')}>
                    {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td>
                  <input aria-label={`Motivo para ${d.calendarDate}`}
                         defaultValue={d.description ?? ''} placeholder="Motivo (opcional)"
                         onBlur={(e) => void cambiar(d, d.dayType, e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
