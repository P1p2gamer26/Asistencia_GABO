#!/usr/bin/env bash
# Copia de la base, comprimida y rotada. Sin Supabase detras, esto es lo unico
# que separa un borrado accidental de una perdida definitiva.
#
# Se instala en la VM con una linea de cron (3 de la manana, sin clases):
#   0 3 * * * /opt/asistencia/tools/backup-db.sh >> /var/log/asistencia-backup.log 2>&1
set -euo pipefail

DESTINO=${DESTINO:-/var/backups/asistencia}
DIAS=${DIAS:-30}
COMPOSE=${COMPOSE:-/opt/asistencia/docker-compose.prod.yml}
# Destino remoto de rclone, p.ej. "r2:asistencia-backups". Vacio = solo local.
REMOTO=${REMOTO:-}

mkdir -p "$DESTINO"
archivo="$DESTINO/asistencia-$(date +%Y%m%d-%H%M).sql.gz"

# --clean --if-exists: el volcado se restaura sobre una base que ya tiene datos
# sin tener que vaciarla a mano antes.
docker compose -f "$COMPOSE" exec -T db \
  pg_dump -U asistencia --clean --if-exists asistencia | gzip > "$archivo"

# Un dump truncado es peor que ninguno: parece que hay respaldo y no lo hay.
# El fallo solo se descubre el dia que toca restaurar, que es el peor dia.
gzip -t "$archivo"
if [ "$(stat -c%s "$archivo")" -lt 1000 ]; then
  echo "ERROR: el dump pesa menos de 1 KB, la base no respondio bien" >&2
  rm -f "$archivo"
  exit 1
fi

# Fuera de la VM, que es el punto: un respaldo que vive en la misma maquina no
# sirve el dia que se pierde la maquina.
if [ -n "$REMOTO" ]; then
  rclone copy "$archivo" "$REMOTO"
else
  echo "AVISO: REMOTO vacio, la copia solo existe en esta VM" >&2
fi

find "$DESTINO" -name 'asistencia-*.sql.gz' -mtime +"$DIAS" -delete
echo "$(date '+%F %T') ok $archivo ($(du -h "$archivo" | cut -f1))"
