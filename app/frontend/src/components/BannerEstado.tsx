type Props = {
  online: boolean;
  alcanzable: boolean;
  pendientes: number;
  onSincronizar: () => void;
};

export default function BannerEstado({ online, alcanzable, pendientes, onSincronizar }: Props) {
  // Sin salida cuenta tanto el modo avion (online false) como el WiFi sin internet
  // (online true, alcanzable false), que es el caso habitual en el colegio.
  const haySalida = online && alcanzable;

  if (haySalida && pendientes === 0) return null;

  return (
    <div className={haySalida ? 'banner pendiente' : 'banner offline'} role="status">
      {haySalida
        ? `${pendientes} registro(s) sin enviar`
        : 'Sin conexion. La asistencia se guarda en el telefono.'}
      {haySalida && pendientes > 0 && (
        <button type="button" onClick={onSincronizar}>Enviar ahora</button>
      )}
    </div>
  );
}
