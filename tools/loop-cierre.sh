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

PLAN="docs/superpowers/plans/2026-08-21-cierre-y-produccion.md"
LOG="$WT/.loop-$TRACK.log"
ESTADO="$WT/.loop-estado"

# Orden de tareas por track. C empieza por C2: es la unica que no depende de A.
case "$TRACK" in
  A) TAREAS="A1 A2 A3 A4" ;;
  D) TAREAS="1 2 3 4 5 6" ;;
  B) TAREAS="B1 B2 B3 B4" ;;
  C) TAREAS="C2 C1 C3 C4" ;;
  D2) TAREAS="1 2 3 4 5 6" ;;
  *) echo "Track invalido: $TRACK" >&2; exit 2 ;;
esac

ESPERA_CUOTA=900        # 15 min entre reintentos cuando se agota la cuota
MAX_ESPERAS=96          # hasta 24 h esperando renovacion
MAX_FALLOS=3            # fallos reales seguidos en la misma tarea antes de rendirse

log() { printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$TRACK" "$*" | tee -a "$LOG"; }

# Reconoce el mensaje de cuota agotada. Si aparece cualquiera de estos, no es un
# error del codigo: es que hay que esperar.
# El mensaje real observado es: "You've hit your session limit · resets 10:30pm (America/Bogota)".
# Ante la duda, mejor esperar de mas que matar el track: un falso positivo cuesta
# una espera; un falso negativo mata el driver, que es justo lo que paso la primera vez.
sin_cuota() {
  grep -qiE "session limit|usage limit|rate.?limit|quota|too many requests|429|limit reached|hit your|resets [0-9]|overloaded|capacity" "$1"
}

# Si el mensaje dice a que hora se renueva, espera hasta esa hora en vez de
# reintentar a ciegas cada 15 minutos.
segundos_hasta_reset() {
  local h t now
  h=$(grep -oiE "resets[[:space:]]+[0-9]{1,2}(:[0-9]{2})?[[:space:]]*[ap]m" "$1" | head -1 \
      | sed -E "s/.*[Rr]esets[[:space:]]+//")
  [ -z "$h" ] && { echo 0; return; }
  t=$(date -d "$h" +%s 2>/dev/null) || { echo 0; return; }
  now=$(date +%s)
  if [ "$t" -le "$now" ]; then
    # Si la hora de renovacion acaba de pasar (menos de una hora), la cuota ya
    # se renovo: reintenta enseguida en vez de dormir un dia entero.
    if [ $((now - t)) -lt 3600 ]; then echo 120; return; fi
    t=$((t + 86400))                           # paso hace rato: es la de manana
  fi
  echo $((t - now + 120))                      # dos minutos de colchon
}

hecha() { [ -f "$ESTADO" ] && grep -qx "$1" "$ESTADO"; }

prompt_de() {
  local t="$1"
  cat <<EOF
Trabajas en el repositorio que tienes abierto (worktree del track $TRACK).

Ejecuta EXACTAMENTE la Task $t del plan de cierre:
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
- Estructura MVC CLASICA POR CAPAS, descrita en app/README.md. Cada capa es un
  paquete con TODAS sus clases dentro:
    co.edu.ggm.asistencia.controller  -> *Controller
    co.edu.ggm.asistencia.service     -> *Service y *Job
    co.edu.ggm.asistencia.repository  -> *Repository
    co.edu.ggm.asistencia.model       -> entidades y enums
    co.edu.ggm.asistencia.config      -> *Config y *Filter
  El sufijo de la clase decide su capa. Ajusta 'package' e imports en consecuencia.
  NO crees paquetes por funcionalidad (nada de calendar/, user/, shared/...).
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
      # Respaldo en el repo propio (privado). Solo la rama del track, nunca main.
      RAMA="$(git rev-parse --abbrev-ref HEAD)"
      if git push -u origin "$RAMA" >>"$LOG" 2>&1; then
        log "rama $RAMA respaldada en origin"
      else
        log "aviso: no se pudo hacer push de $RAMA (el trabajo esta commiteado local)"
      fi
      break
    fi

    if sin_cuota "$SALIDA"; then
      esperas=$((esperas + 1))
      if [ "$esperas" -gt "$MAX_ESPERAS" ]; then
        log "24 h esperando cuota sin exito. Me detengo en $TAREA."
        rm -f "$SALIDA"; exit 3
      fi
      dormir=$(segundos_hasta_reset "$SALIDA")
      if [ "${dormir:-0}" -gt 0 ] 2>/dev/null; then
        log "Cuota agotada. El mensaje dice que se renueva en $((dormir / 60)) min; espero hasta entonces."
      else
        dormir="$ESPERA_CUOTA"
        log "Cuota agotada, sin hora de renovacion en el mensaje. Espero ${dormir}s (intento $esperas/$MAX_ESPERAS)."
      fi
      grep -iE "session limit|usage limit|resets" "$SALIDA" | head -2 >>"$LOG"
      rm -f "$SALIDA"
      sleep "$dormir"
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
