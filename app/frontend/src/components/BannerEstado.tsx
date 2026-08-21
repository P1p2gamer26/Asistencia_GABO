type Props = { online: boolean; pendientes: number; onSincronizar: () => void };

export default function BannerEstado({ online, pendientes, onSincronizar }: Props) {
  if (online && pendientes === 0) return null;
  return (
    <div className={online ? 'banner pendiente' : 'banner offline'} role="status">
      {online
        ? `${pendientes} registro(s) sin enviar`
        : 'Sin conexion. La asistencia se guarda en el telefono.'}
      {online && pendientes > 0 && (
        <button type="button" onClick={onSincronizar}>Enviar ahora</button>
      )}
    </div>
  );
}
