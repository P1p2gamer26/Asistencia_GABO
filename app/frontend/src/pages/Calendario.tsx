import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../api/client';
import type { DayType, SchoolDay } from '../api/contract';

const TIPOS: DayType[] = ['LECTIVO', 'FESTIVO', 'VACACIONES', 'INSTITUCIONAL', 'SUSPENDIDO'];

const ETIQUETA: Record<DayType, string> = {
  LECTIVO: 'clase',
  FESTIVO: 'festivo',
  VACACIONES: 'vacaciones',
  INSTITUCIONAL: 'jornada institucional',
  SUSPENDIDO: 'suspendido',
};

/** Version corta para pantallas de 360px: lectivo es el caso normal y no necesita
 * etiqueta, pero un dia especial siempre debe decir por escrito que lo es, aunque
 * no haya espacio para la palabra completa (nunca solo color). */
const ETIQUETA_CORTA: Record<DayType, string> = {
  LECTIVO: '',
  FESTIVO: 'Fest.',
  VACACIONES: 'Vac.',
  INSTITUCIONAL: 'Inst.',
  SUSPENDIDO: 'Susp.',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Lunes a domingo: el colegio piensa la semana empezando en lunes. */
const CABECERAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

const dosDigitos = (n: number) => String(n).padStart(2, '0');
const fechaISO = (a: number, m: number, d: number) =>
  `${a}-${dosDigitos(m + 1)}-${dosDigitos(d)}`;

export default function Calendario({ hoy = new Date() }: { hoy?: Date }) {
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [dias, setDias] = useState<Record<string, SchoolDay>>({});
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const sesion = getSession();
  const puedeEditar = ['COORDINADOR', 'ADMIN'].includes(sesion?.role ?? '');

  const primero = new Date(anio, mes, 1);
  const ultimo = new Date(anio, mes + 1, 0);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const lista = await api.get<SchoolDay[]>(
        `/api/calendar/school-days?from=${fechaISO(anio, mes, 1)}`
        + `&to=${fechaISO(anio, mes, ultimo.getDate())}`);
      setDias(Object.fromEntries(lista.map((d) => [d.calendarDate, d])));
    } catch {
      setError('No se pudo cargar el calendario. Requiere conexion.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { void cargar(); }, [anio, mes]);

  // Dia de ciclo elegido pero aun no aplicado, por fecha: el usuario elige el
  // numero y luego decide si es solo ese dia o en cascada.
  const [cicloElegido, setCicloElegido] = useState<Record<string, string>>({});

  async function fijarCiclo(fecha: string, cascada: boolean) {
    const v = cicloElegido[fecha] ?? '';
    setError('');
    try {
      await api.put(`/api/calendar/school-days/${fecha}/cycle-day`,
        { cycleDay: v === '' ? null : Number(v), cascada });
      setCicloElegido((c) => { const { [fecha]: _, ...resto } = c; return resto; });
      await cargar();
    } catch {
      setError('No se pudo fijar el dia de ciclo.');
    }
  }

  async function cambiar(fecha: string, tipo: DayType) {
    setError('');
    try {
      await api.put(`/api/calendar/school-days/${fecha}`,
        { dayType: tipo, description: dias[fecha]?.description ?? null });
      await cargar();
    } catch {
      setError('No se pudo actualizar ese dia.');
    }
  }

  // Las casillas vacias del principio: getDay() da 0 para domingo y la semana empieza
  // en lunes, asi que el domingo va al final.
  const huecos = (primero.getDay() + 6) % 7;

  const lectivos = useMemo(
    () => Object.values(dias).filter((d) => d.dayType === 'LECTIVO').length,
    [dias]);

  function mover(delta: number) {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
  }

  return (
    <main className="card ancha">
      {!sesion && <p><Link to="/">« Volver al inicio</Link></p>}
      <h1>Calendario escolar</h1>

      <div className="leyenda" style={{ marginBottom: 12 }}>
        <button type="button" className="secundario" onClick={() => mover(-1)}>Mes anterior</button>
        <strong style={{ minWidth: '10rem', textAlign: 'center' }}>
          {MESES[mes]} de {anio}
        </strong>
        <button type="button" className="secundario" onClick={() => mover(1)}>Mes siguiente</button>
      </div>

      <p className="meta">
        {cargando ? 'Cargando...' : `${lectivos} dias de clase este mes.`}
        {puedeEditar && ' Puede cambiar el tipo de cualquier dia y fijar el dia de ciclo (D1 a D5).'}
      </p>
      {error && <p role="alert" className="error">{error}</p>}

      <div className="calendario" role="grid" aria-label={`Calendario de ${MESES[mes]} de ${anio}`}>
        {CABECERAS.map((c) => (
          <div key={c} className="calendario-cabecera" role="columnheader">{c}</div>
        ))}
        {Array.from({ length: huecos }, (_, i) => (
          <div key={`hueco-${i}`} className="calendario-hueco" role="gridcell" />
        ))}
        {Array.from({ length: ultimo.getDate() }, (_, i) => {
          const dia = i + 1;
          const fecha = fechaISO(anio, mes, dia);
          const info = dias[fecha];
          const tipo = info?.dayType;
          // Sin dato: fin de semana o fecha fuera del ano escolar sembrado.
          const clase = tipo ? `dia-${tipo.toLowerCase()}` : 'dia-sin-clase';
          const etiqueta = tipo ? ETIQUETA[tipo] : 'sin clase';
          const etiquetaCorta = tipo ? ETIQUETA_CORTA[tipo] : '';

          return (
            <div key={fecha} role="gridcell"
                 className={`calendario-dia ${clase}${info?.cycleDayFixed ? ' anclado' : ''}`}
                 aria-label={`${dia} de ${MESES[mes]}: ${etiqueta}`
                   + (info?.cycleDay ? `, dia ${info.cycleDay}` : '')}>
              <span className="numero">{dia}</span>
              {info?.cycleDay && (
                <span className="ciclo" title={info.cycleDayFixed ? 'Dia fijado a mano' : undefined}>
                  D{info.cycleDay}{info.cycleDayFixed ? '*' : ''}
                </span>
              )}
              <span className="tipo">{etiqueta}</span>
              {etiquetaCorta && <span className="tipo-corto">{etiquetaCorta}</span>}
              {info?.description && <span className="motivo">{info.description}</span>}
              {puedeEditar && info && (
                <select aria-label={`Tipo de dia para ${fecha}`} value={tipo}
                        onChange={(e) => void cambiar(fecha, e.target.value as DayType)}>
                  {TIPOS.map((t) => <option key={t} value={t}>{ETIQUETA[t]}</option>)}
                </select>
              )}
              {puedeEditar && info?.cycleDay && (
                <div className="ciclo-editor">
                  <select aria-label={`Dia de ciclo para ${fecha}`}
                          value={cicloElegido[fecha] ?? String(info.cycleDay)}
                          onChange={(e) => setCicloElegido((c) => ({ ...c, [fecha]: e.target.value }))}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Dia {n}</option>)}
                    {info.cycleDayFixed && <option value="">Quitar ajuste</option>}
                  </select>
                  {fecha in cicloElegido && (
                    <>
                      <button type="button" className="secundario"
                              onClick={() => void fijarCiclo(fecha, false)}>Solo este dia</button>
                      <button type="button" className="secundario"
                              onClick={() => void fijarCiclo(fecha, true)}>Este y los siguientes</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="leyenda">
        {TIPOS.map((t) => (
          <span key={t}><i className={`muestra dia-${t.toLowerCase()}`} />{ETIQUETA[t]}</span>
        ))}
      </div>
    </main>
  );
}
