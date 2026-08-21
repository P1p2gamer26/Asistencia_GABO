#!/usr/bin/env bash
# Driver autonomo de un track. Ejecuta las tareas del plan una por una con
# `claude -p`, y cuando se acaba la cuota espera a que se renueve y sigue.
#
#   ./loop-track.sh A "/c/.../.worktrees/track-a" asistencia_test_a
#
# Reanudable: si se corta, vuelve a arrancar donde iba (lee .loop-estado).

set -uo pipefail

TRACK="${1:?falta el track: A, B o C}"
WT="${2:?falta la ruta del worktree}"
DB="${3:?falta el nombre de la base de datos}"

PLAN="docs/superpowers/plans/2026-08-20-sistema-asistencia-paralelo.md"
LOG="$WT/.loop-$TRACK.log"
ESTADO="$WT/.loop-estado"

# Orden de tareas por track. C empieza por C2: es la unica que no depende de A.
case "$TRACK" in
  A) TAREAS="A1 A2 A3 A4" ;;
  B) TAREAS="B1 B2 B3 B4" ;;
  C) TAREAS="C2 C1 C3 C4" ;;
  *) echo "Track invalido: $TRACK" >&2; exit 2 ;;
esac

ESPERA_CUOTA=900        # 15 min entre reintentos cuando se agota la cuota
MAX_ESPERAS=96          # hasta 24 h esperando renovacion
MAX_FALLOS=3            # fallos reales seguidos en la misma tarea antes de rendirse

log() { printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$TRACK" "$*" | tee -a "$LOG"; }

# Reconoce el mensaje de cuota agotada. Si aparece cualquiera de estos, no es un
# error del codigo: es que hay que esperar.
sin_cuota() {
  grep -qiE 'usage limit|rate limit|rate_limit|quota|too many requests|429|limit reached|overloaded' "$1"
}

hecha() { [ -f "$ESTADO" ] && grep -qx "$1" "$ESTADO"; }

prompt_de() {
  local t="$1"
  cat <<EOF
Trabajas en el repositorio que tienes abierto (worktree del track $TRACK).

Ejecuta EXACTAMENTE la Task $t del plan:
  $PLAN

LEE ESE FICHERO PRIMERO. Contiene el codigo exacto de cada paso. Es la
especificacion: no improvises ni "mejores" el diseno. Cuando el plan diga
"ejecuta la Task N de v1", ese v1 es
docs/superpowers/plans/2026-08-20-sistema-asistencia-web.md, tambien en el repo.

CONTEXTO DE ESTA MAQUINA (difiere del plan, respetalo):
- El proyecto vive en app/ : app/backend, app/frontend, app/contracts.
- NO hay Docker. Los tests usan el PostgreSQL 16 local ya instalado.
  Ejecuta el backend asi:
    cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/$DB \\
      TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test
  Esa base ya existe. No uses otra: es la tuya y no la comparten los demas tracks.
- Frontend: cd app/frontend && npm test  (y npm run build)
- Estructura MVC obligatoria del backend, descrita en app/README.md: cada
  funcionalidad es un paquete y dentro se separan controller/ service/
  repository/ model/. Ajusta la linea 'package' de cada clase en consecuencia.
  Ejemplo: co.edu.ggm.asistencia.calendar.controller.CalendarController.
  Las clases transversales (SecurityConfig, JwtFilter, JwtService) van en
  co.edu.ggm.asistencia.shared.config y .shared.service.
- NUNCA hagas 'git push'. El remoto es de otra persona y esta deshabilitado.
  Solo commits locales.
- No toques ficheros de otros tracks. La tabla de propiedad esta en el plan,
  seccion "Propiedad de ficheros".

AL TERMINAR:
1. Los tests de la tarea deben pasar. Si no pasan, arregla el codigo (no el test)
   hasta que pasen, salvo que el test este mal segun el plan.
2. Anade una linea a docs/ESTADO.md describiendo lo que quedo hecho.
3. Haz UN commit local con mensaje en espanol, formato Conventional Commits,
   terminando con:
   Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

Si algo te bloquea de verdad y no puedes avanzar, escribelo en docs/ESTADO.md
bajo "## Bloqueos", haz commit de esa nota y termina explicando el bloqueo.
EOF
}

log "=== arranca driver. Tareas: $TAREAS"
cd "$WT" || { log "no existe el worktree $WT"; exit 1; }

for TAREA in $TAREAS; do
  if hecha "$TAREA"; then log "Task $TAREA ya estaba hecha, la salto"; continue; fi

  fallos=0
  esperas=0

  while :; do
    log "--- Task $TAREA (fallos=$fallos, esperas=$esperas)"
    SALIDA="$(mktemp)"

    if prompt_de "$TAREA" | claude -p \
         --permission-mode acceptEdits \
         --allowedTools Bash Read Write Edit Glob Grep \
         --model claude-sonnet-5 >"$SALIDA" 2>&1; then
      log "Task $TAREA OK"
      tail -30 "$SALIDA" >>"$LOG"
      echo "$TAREA" >>"$ESTADO"
      rm -f "$SALIDA"
      break
    fi

    if sin_cuota "$SALIDA"; then
      esperas=$((esperas + 1))
      if [ "$esperas" -gt "$MAX_ESPERAS" ]; then
        log "24 h esperando cuota sin exito. Me detengo en $TAREA."
        rm -f "$SALIDA"; exit 3
      fi
      log "Cuota agotada. Espero ${ESPERA_CUOTA}s y reintento (intento $esperas/$MAX_ESPERAS)."
      rm -f "$SALIDA"
      sleep "$ESPERA_CUOTA"
      continue
    fi

    fallos=$((fallos + 1))
    log "Fallo real en $TAREA (intento $fallos/$MAX_FALLOS):"
    tail -25 "$SALIDA" >>"$LOG"
    rm -f "$SALIDA"
    if [ "$fallos" -ge "$MAX_FALLOS" ]; then
      log "Task $TAREA fallo $MAX_FALLOS veces. Track $TRACK detenido para revision humana."
      exit 4
    fi
    sleep 30
  done
done

log "=== TRACK $TRACK COMPLETO ==="
