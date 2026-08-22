#!/usr/bin/env bash
# Simula la hora punta real del colegio: todos los docentes sincronizando su curso a la
# vez, que es lo que pasa a las 7:00 de la manana. Cada uno manda 40 registros, y todos
# hacen upsert contra la misma restriccion unica.
#
#   ./carga-concurrente.sh [url] [fecha] [cuantos]
#
# Necesita /tmp/docentes.txt con lineas "correo|idBloque|grado".

set -uo pipefail

BASE="${1:-http://localhost:8082}"
FECHA="${2:?falta la fecha lectiva}"
CUANTOS="${3:-40}"

LISTA="${LISTA:-/tmp/docentes.txt}"
SALIDAS=$(mktemp -d)

echo "== $CUANTOS docentes sincronizando a la vez contra $BASE, fecha $FECHA"

lanzar() { # correo, idBloque, indice
  local correo="$1" bloque="$2" i="$3"
  local token
  token=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$correo\",\"password\":\"cambiar123\"}" \
    | sed -E 's/.*"token":"([^"]+)".*/\1/')
  [ -z "$token" ] && { echo "SIN_TOKEN" > "$SALIDAS/$i"; return; }

  # 40 estudiantes distintos por docente, dando la vuelta si hay menos estudiantes que
  # docentes por 40: el objetivo es medir concurrencia real, no inventar ids que no
  # existen. MIN_ID y TOTAL vienen del entorno para no adivinar el rango.
  local total="${TOTAL_ESTUDIANTES:?falta TOTAL_ESTUDIANTES}"
  local minid="${MIN_ID:?falta MIN_ID}"
  local desde=$(( minid + ((i - 1) * 40) % total ))
  local cuerpo="$SALIDAS/cuerpo-$i.json"
  python -c "
import json, uuid
recs=[{'id':str(uuid.uuid4()),'studentId':s,'scheduleBlockId':$bloque,
       'classDate':'$FECHA','status':'P','recordedAt':'${FECHA}T12:00:00Z'}
      for s in [$minid + (($desde - $minid) + k) % $total for k in range(40)]]
print(json.dumps({'records':recs}))" > "$cuerpo"

  local ini fin
  ini=$(date +%s%3N)
  local resp
  resp=$(curl -s -X POST "$BASE/api/attendance/sync" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    --data-binary "@$cuerpo")
  fin=$(date +%s%3N)
  echo "$((fin - ini)) $resp" > "$SALIDAS/$i"
}

i=0
INICIO=$(date +%s%3N)
while IFS='|' read -r correo bloque grado; do
  i=$((i + 1))
  [ "$i" -gt "$CUANTOS" ] && break
  lanzar "$correo" "$bloque" "$i" &
done < "$LISTA"
wait
TOTAL=$(( $(date +%s%3N) - INICIO ))

# --- Resultados ---------------------------------------------------------------
aceptados=0; rechazados=0; errores=0; peor=0; suma=0; n=0
for f in "$SALIDAS"/[0-9]*; do
  linea=$(cat "$f")
  case "$linea" in
    SIN_TOKEN) errores=$((errores + 1)); continue ;;
  esac
  ms=${linea%% *}; resp=${linea#* }
  n=$((n + 1)); suma=$((suma + ms))
  [ "$ms" -gt "$peor" ] && peor=$ms
  a=$(printf '%s' "$resp" | sed -nE 's/.*"accepted":([0-9]+).*/\1/p')
  aceptados=$((aceptados + ${a:-0}))
  case "$resp" in *'"rejected":[{'*) rechazados=$((rechazados + 1)) ;; esac
  case "$resp" in *'"status":5'*) errores=$((errores + 1)) ;; esac
done

echo "  peticiones correctas : $n de $CUANTOS"
echo "  registros aceptados  : $aceptados (esperados $((CUANTOS * 40)))"
echo "  con rechazos         : $rechazados"
echo "  errores del servidor : $errores"
[ "$n" -gt 0 ] && echo "  latencia media       : $((suma / n)) ms"
echo "  peor latencia        : ${peor} ms"
echo "  tiempo total         : ${TOTAL} ms"

rm -rf "$SALIDAS"
[ "$errores" -eq 0 ] && [ "$aceptados" -eq $((CUANTOS * 40)) ]
