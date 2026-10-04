type Props = {
  valor: string | number; etiqueta: string; sufijo?: string;
  /** El punto toma el color de lo que se cuenta: falta (rojo), evasion (morado) o
   *  pendiente (oro). `true` es falta, por compatibilidad. */
  alerta?: boolean | 'falta' | 'evasion' | 'pendiente'; principal?: boolean;
};

export default function Kpi({ valor, etiqueta, sufijo, alerta, principal }: Props) {
  // La alerta se marca con el filete del margen (clase .alerta), no tinendo la
  // cifra: un numero rojo sobre papel crema pierde contraste al sol.
  const tono = alerta === true ? 'falta' : alerta;
  const clases = ['kpi', principal && 'principal', tono && `alerta alerta-${tono}`].filter(Boolean).join(' ');
  return (
    <div className={clases}>
      <div className="valor">{valor}{sufijo}</div>
      <div className="etiqueta">{etiqueta}</div>
    </div>
  );
}
