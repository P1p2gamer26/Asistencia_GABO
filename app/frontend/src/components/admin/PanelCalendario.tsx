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
  const [aviso, setAviso] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [rDesde, setRDesde] = useState('');
  const [rHasta, setRHasta] = useState('');
  const [rTipo, setRTipo] = useState<DayType>('SUSPENDIDO');
  const [rMotivo, setRMotivo] = useState('');

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

  async function aplicarRango() {
    setError('');
    setAviso('');
    try {
      const res = await api.put<{ cambiados: number }>('/api/calendar/school-days',
        { from: rDesde, to: rHasta, dayType: rTipo, description: rMotivo, soloHabiles: true });
      setAviso(`Se cambiaron ${res.cambiados} dias.`);
      await cargar();
    } catch {
      setError('No se pudo aplicar el rango.');
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
      <button type="button" className="secundario" onClick={() => setAbierto((v) => !v)}>
        Marcar un rango
      </button>
      {error && <p role="alert" className="error">{error}</p>}
      {aviso && <p role="status" className="meta">{aviso}</p>}

      {abierto && (
        <div className="filtros">
          <label htmlFor="r-desde">Rango desde</label>
          <input id="r-desde" type="date" value={rDesde} onChange={(e) => setRDesde(e.target.value)} />
          <label htmlFor="r-hasta">Rango hasta</label>
          <input id="r-hasta" type="date" value={rHasta} onChange={(e) => setRHasta(e.target.value)} />
          <label htmlFor="r-tipo">Tipo del rango</label>
          <select id="r-tipo" value={rTipo} onChange={(e) => setRTipo(e.target.value as DayType)}>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label htmlFor="r-motivo">Motivo del rango</label>
          <input id="r-motivo" value={rMotivo} onChange={(e) => setRMotivo(e.target.value)}
                 placeholder="Paro, jornada pedagogica..." />
          <button type="button" disabled={!rDesde || !rHasta} onClick={() => void aplicarRango()}>
            Aplicar al rango
          </button>
          <p className="meta">Solo se cambian los dias de lunes a viernes.</p>
        </div>
      )}

      <p className="meta">
        Cambiar un dia a algo distinto de LECTIVO impide registrar asistencia ese dia,
        tanto en la aplicacion como en el servidor.
      </p>

      <div className="tabla-scroll">
        <table>
          <thead><tr><th>Fecha</th><th>Dia</th><th>Tipo</th><th>Motivo</th></tr></thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.calendarDate}>
                <td>{new Date(`${d.calendarDate}T00:00`).toLocaleDateString('es-CO',
                      { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                <td>{d.cycleDay ? `D${d.cycleDay}` : ''}</td>
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
