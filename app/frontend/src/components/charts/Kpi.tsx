type Props = { valor: string | number; etiqueta: string; sufijo?: string; alerta?: boolean };

export default function Kpi({ valor, etiqueta, sufijo, alerta }: Props) {
  return (
    <div className="kpi">
      <div className="valor" style={alerta ? { color: 'var(--estado-f)' } : undefined}>
        {valor}{sufijo}
      </div>
      <div className="etiqueta">{etiqueta}</div>
    </div>
  );
}
