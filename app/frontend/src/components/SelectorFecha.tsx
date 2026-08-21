import { useEffect, useState } from 'react';
import { db } from '../db/local';
import type { SchoolDay } from '../api/contract';

const ETIQUETA_TIPO: Record<string, string> = {
  FESTIVO: 'festivo', VACACIONES: 'vacaciones',
  INSTITUCIONAL: 'jornada institucional', SUSPENDIDO: 'dia suspendido',
};

type Props = { valor: string; onChange: (fecha: string) => void; max: string };

export default function SelectorFecha({ valor, onChange, max }: Props) {
  const [dia, setDia] = useState<SchoolDay | undefined>();
  const [recientes, setRecientes] = useState<string[]>([]);

  useEffect(() => { void db.schoolDays.get(valor).then(setDia); }, [valor]);

  useEffect(() => {
    void db.schoolDays.where('dayType').equals('LECTIVO').toArray().then((dias) => {
      setRecientes(dias.map((d) => d.calendarDate).filter((d) => d <= max).sort().slice(-5).reverse());
    });
  }, [max]);

  const lectivo = dia?.dayType === 'LECTIVO';

  return (
    <>
      <label htmlFor="fecha">Fecha</label>
      <div>
        <input id="fecha" type="date" value={valor} max={max}
               onChange={(e) => onChange(e.target.value)} />
        <div className="leyenda">
          {recientes.map((d) => (
            <button key={d} type="button" className="secundario"
                    style={{ minHeight: 32, padding: '4px 10px' }}
                    onClick={() => onChange(d)}>
              {new Date(`${d}T00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
            </button>
          ))}
        </div>
      </div>
      {!lectivo && (
        <p role="alert" className="banner no-lectivo" style={{ gridColumn: '1 / -1' }}>
          {dia
            ? `El ${new Date(`${valor}T00:00`).toLocaleDateString('es-CO')} es ${ETIQUETA_TIPO[dia.dayType] ?? 'no lectivo'}`
              + (dia.description ? ` (${dia.description}).` : '.') + ' No se toma asistencia.'
            : 'Esa fecha no esta en el calendario descargado. Actualice los datos con conexion.'}
        </p>
      )}
    </>
  );
}
