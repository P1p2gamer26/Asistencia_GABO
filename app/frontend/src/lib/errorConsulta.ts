import { HttpError, OfflineError } from '../api/client';

/**
 * Texto que ve el docente cuando falla una consulta. Antes todo fallo decia
 * "Requiere conexion", aunque el servidor respondiera 500: el docente creia que
 * era el internet y no habia nada que hacer.
 */
export function mensajeConsulta(e: unknown): string {
  if (e instanceof OfflineError) return 'Sin conexión a internet. Revisa la red y toca Reintentar.';
  if (e instanceof HttpError) {
    if (e.status === 401 || e.status === 403) return 'Tu sesión venció. Vuelve a entrar y toca Reintentar.';
    if (e.status === 400) return 'La consulta no es válida. Revisa las fechas y el curso.';
    if (e.status >= 500) return 'El servidor no pudo completar esta consulta. Toca Reintentar; si vuelve a pasar, avísale al administrador.';
  }
  return 'No se pudo consultar. Toca Reintentar.';
}
