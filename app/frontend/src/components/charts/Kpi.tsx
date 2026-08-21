type Props = {
  valor: string | number; etiqueta: string; sufijo?: string;
  alerta?: boolean; principal?: boolean;
};

export default function Kpi({ valor, etiqueta, sufijo, alerta, principal }: Props) {
  // La alerta se marca con el filete del margen (clase .alerta), no tinendo la
  // cifra: un numero rojo sobre papel crema pierde contraste al sol.
  const clases = ['kpi', principal && 'principal', alerta && 'alerta'].filter(Boolean).join(' ');
  return (
    <div className={clases}>
      <div className="valor">{valor}{sufijo}</div>
      <div className="etiqueta">{etiqueta}</div>
    </div>
  );
}
