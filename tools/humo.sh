#!/usr/bin/env bash
# Prueba de humo contra una instancia REAL ya corriendo (la imagen desplegada, o
# `mvn spring-boot:run` en local). Comprueba los invariantes del sistema de punta a
# punta: los tres bugs mas serios de este proyecto no los encontro ningun test
# unitario, los encontro mirar la aplicacion funcionando. Esto lo automatiza.
#
#   ./humo.sh [http://localhost:8080]
#
# Salida 0 si todo pasa; 1 en cuanto algo falla, diciendo que fallo.

set -uo pipefail

BASE="${1:-http://localhost:8080}"
FALLOS=0

ok()    { printf '  OK    %s\n' "$1"; }
falla() { printf '  FALLA %s\n     esperado: %s\n     recibido: %s\n' "$1" "$2" "$3"; FALLOS=$((FALLOS + 1)); }

comprobar() { # nombre, esperado, recibido
  if [ "$2" = "$3" ]; then ok "$1"; else falla "$1" "$2" "$3"; fi
}

contiene() { # nombre, fragmento esperado, texto
  case "$3" in *"$2"*) ok "$1" ;; *) falla "$1" "que contuviera: $2" "$3" ;; esac
}

echo "== Prueba de humo contra $BASE"

# --- Arranque -----------------------------------------------------------------
for i in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/actuator/health")" = "200" ] && break
  sleep 3
done
comprobar "la aplicacion responde" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/actuator/health")"

# --- Autenticacion ------------------------------------------------------------
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"fpalacios@ggm.edu.co","password":"cambiar123"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')
if [ -n "$TOKEN" ] && [ "$TOKEN" != "$(printf '%s' "$TOKEN" | grep -c token)" ]; then
  ok "el docente puede entrar"
else
  falla "el docente puede entrar" "un token" "$TOKEN"
fi

comprobar "una clave incorrecta se rechaza" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
     -H 'Content-Type: application/json' \
     -d '{"email":"fpalacios@ggm.edu.co","password":"incorrecta"}')"

comprobar "sin token no se entra" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/sync/bootstrap")"

# Un navegador manda la cabecera Origin y curl no. Sin esta comprobacion, "el login
# funciona" se puede afirmar con una peticion que ningun navegador hace jamas: paso
# en el tunel de pruebas del 2026-08-21, donde curl daba 200 y el celular 403.
# Con el frontend en Vercel y la API en otro dominio es el fallo que tumba el
# despliegue el primer dia, y no deja ni rastro en el registro del servidor.
comprobar "el login funciona desde un navegador (con Origin)" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
     -H "Origin: $BASE" -H 'Content-Type: application/json' \
     -d '{"email":"fpalacios@ggm.edu.co","password":"cambiar123"}')"

comprobar "un origen ajeno se rechaza" "403" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$BASE/api/auth/login" \
     -H 'Origin: https://sitio-que-no-es-nuestro.example' \
     -H 'Access-Control-Request-Method: POST')"

AUTH="Authorization: Bearer $TOKEN"

# --- Horas sin desfase de zona horaria ----------------------------------------
# El bug que 41 tests unitarios no vieron: un bloque de 06:30 llegaba como 01:30.
BOOT=$(curl -s "$BASE/api/sync/bootstrap" -H "$AUTH")
contiene "la hora del bloque no se desplaza" '"startTime":"06:30"' "$BOOT"
contiene "el bootstrap trae el calendario" '"schoolDays"' "$BOOT"

# --- Idempotencia -------------------------------------------------------------
UUID="5a0e0e00-0000-4000-8000-$(date +%H%M%S)$(printf %06d $((RANDOM % 1000000)))"
LOTE=$(printf '{"records":[{"id":"%s","studentId":1,"scheduleBlockId":1,"classDate":"2026-08-18","status":"P","recordedAt":"2026-08-18T12:00:00Z"}]}' "$UUID")
R1=$(curl -s -X POST "$BASE/api/attendance/sync" -H "$AUTH" -H 'Content-Type: application/json' -d "$LOTE")
R2=$(curl -s -X POST "$BASE/api/attendance/sync" -H "$AUTH" -H 'Content-Type: application/json' -d "$LOTE")
contiene "el primer envio se acepta"   '"accepted":1' "$R1"
contiene "reenviar no falla"           '"accepted":1' "$R2"

GUARDADO=$(curl -s "$BASE/api/attendance?blockId=1&date=2026-08-18" -H "$AUTH")
VECES=$(printf '%s' "$GUARDADO" | grep -o '"studentId":1' | wc -l | tr -d ' ')
comprobar "reenviar no duplica la fila" "1" "$VECES"

# --- Calendario ---------------------------------------------------------------
FESTIVO=$(curl -s -X POST "$BASE/api/attendance/sync" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"records":[{"id":"5a0e0e00-0000-4000-8000-000000000fff","studentId":1,"scheduleBlockId":1,"classDate":"2026-08-17","status":"P","recordedAt":"2026-08-17T12:00:00Z"}]}')
contiene "un festivo se rechaza"        '"accepted":0' "$FESTIVO"
contiene "y dice por que"               'no es un dia lectivo' "$FESTIVO"

DOMINGO=$(curl -s -X POST "$BASE/api/attendance/sync" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"records":[{"id":"5a0e0e00-0000-4000-8000-000000000ddd","studentId":1,"scheduleBlockId":1,"classDate":"2026-08-16","status":"P","recordedAt":"2026-08-16T12:00:00Z"}]}')
contiene "un domingo se rechaza"        '"accepted":0' "$DOMINGO"

# --- Roles --------------------------------------------------------------------
comprobar "un docente no administra usuarios" "403" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin/users" -H "$AUTH")"
comprobar "un docente no ve el tablero" "403" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/reports/dashboard?from=2026-08-01&to=2026-08-31" -H "$AUTH")"

COORD=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"coord@ggm.edu.co","password":"cambiar123"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
comprobar "coordinacion si ve el tablero" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/reports/dashboard?from=2026-08-01&to=2026-08-31" \
     -H "Authorization: Bearer $COORD")"

# --- Informe en Excel ---------------------------------------------------------
TIPO=$(curl -s -o /dev/null -w '%{content_type}' "$BASE/api/reports/excel?from=2026-08-01&to=2026-08-31" \
  -H "Authorization: Bearer $COORD")
contiene "el Excel se descarga" "spreadsheetml" "$TIPO"

# --- Rutas de la SPA ----------------------------------------------------------
# Solo tiene sentido contra la imagen empaquetada, que sirve el frontend.
RAIZ=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")
if [ "$RAIZ" != "200" ]; then
  echo "  --    ruta de la SPA omitida: esta instancia no sirve el frontend"
else
  comprobar "recargar una ruta de la SPA no da 404" "200"     "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/asistencia")"
fi

# --- Endurecimiento -----------------------------------------------------------
comprobar "sin token no se cambia la clave de nadie" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/change-password" \
     -H 'Content-Type: application/json' \
     -d '{"currentPassword":"x","newPassword":"yyyyyyyy"}')"

# El lote va por fichero, no por argumento: 501 registros en la linea de comandos
# superan el limite de longitud del sistema y curl falla antes de enviar nada.
LOTE_ENORME=$(mktemp)
python -c "
import json
print(json.dumps({'records': [{'id': f'00000000-0000-4000-8000-{i:012d}', 'studentId': 1,
  'scheduleBlockId': 1, 'classDate': '2026-04-06', 'status': 'P',
  'recordedAt': '2026-04-06T11:30:00Z'} for i in range(501)]}))" > "$LOTE_ENORME"
comprobar "un lote desmesurado se rechaza" "400"   "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/attendance/sync"      -H "$AUTH" -H 'Content-Type: application/json' --data-binary "@$LOTE_ENORME")"
rm -f "$LOTE_ENORME"

# --- La asistencia se guarda completa ------------------------------------------
# De un curso de N estudiantes deben quedar N registros, no solo los que el docente
# toco. Se comprueba contra el bloque de la semilla, que tiene 2 estudiantes en 601.
FECHA_LIBRE="2026-03-10"
LOTE_COMPLETO=$(mktemp)
python -c "
import json, uuid
recs = [{'id': str(uuid.uuid4()), 'studentId': i, 'scheduleBlockId': 1,
         'classDate': '$FECHA_LIBRE', 'status': 'P',
         'recordedAt': '${FECHA_LIBRE}T12:00:00Z'} for i in (1, 2)]
print(json.dumps({'records': recs}))" > "$LOTE_COMPLETO"
curl -s -o /dev/null -X POST "$BASE/api/attendance/sync" -H "$AUTH" \
  -H 'Content-Type: application/json' --data-binary "@$LOTE_COMPLETO"
rm -f "$LOTE_COMPLETO"

GUARDADOS=$(curl -s "$BASE/api/attendance?blockId=1&date=$FECHA_LIBRE" -H "$AUTH" \
  | grep -o '"studentId"' | wc -l | tr -d ' ')
comprobar "el curso se guarda completo" "2" "$GUARDADOS"

# --- El motivo de una tardanza sobrevive ---------------------------------------
FECHA_M="2026-03-17"
LOTE_M=$(mktemp)
python -c "
import json, uuid
print(json.dumps({'records': [{'id': str(uuid.uuid4()), 'studentId': 1, 'scheduleBlockId': 1,
  'classDate': '$FECHA_M', 'status': 'T', 'comment': 'El bus se demoro',
  'recordedAt': '${FECHA_M}T12:00:00Z'}]}))" > "$LOTE_M"
curl -s -o /dev/null -X POST "$BASE/api/attendance/sync" -H "$AUTH" \
  -H 'Content-Type: application/json' --data-binary "@$LOTE_M"
rm -f "$LOTE_M"

MOTIVO=$(curl -s "$BASE/api/attendance?blockId=1&date=$FECHA_M" -H "$AUTH")
contiene "el motivo de la tardanza se guarda" 'El bus se demoro' "$MOTIVO"

# --- Resultado ----------------------------------------------------------------
echo
if [ "$FALLOS" -eq 0 ]; then
  echo "== Todos los invariantes se mantienen."
  exit 0
fi
echo "== $FALLOS comprobacion(es) fallida(s)."
exit 1
