#!/usr/bin/env bash
# Reintenta crear la VM Always Free hasta que Oracle tenga capacidad ARM.
#
# El "Out of capacity for shape VM.Standard.A1.Flex" no es un error de
# configuracion: Bogota tiene un solo availability domain y a ratos no hay
# hosts ARM libres. Se libera capacidad de forma esporadica, asi que la unica
# via es insistir. Dejar esto corriendo y olvidarse.
#
#   ./tools/oci-reintentar-vm.sh
#
# Requiere la CLI de OCI configurada (`oci setup config`).
# Con OCPUS=1 MEM=6 se prueba una VM mas pequena, que entra donde 4/24 no.
set -euo pipefail

TENANCY=${TENANCY:-$(grep -m1 "^tenancy" ~/.oci/config | cut -d= -f2 | tr -d " ")}   # repo publico: no hardcodear el OCID
NOMBRE=${NOMBRE:-asistencia-ggm}
OCPUS=${OCPUS:-4}
MEM=${MEM:-24}
# Oracle limita la tasa de launch_instance por usuario y responde 429 si se
# insiste muy seguido, asi que bajar de 5 minutos es contraproducente.
ESPERA=${ESPERA:-300}          # segundos entre intentos
LLAVE=${LLAVE:-$HOME/.ssh/oracle-asistencia.pub}

# Se descubren en vez de hardcodearse: los OCID cambian por tenancy y la imagen
# de Ubuntu se renueva cada mes.
ad=$(oci iam availability-domain list --compartment-id "$TENANCY" \
  --query 'data[0].name' --raw-output)
subnet=$(oci network subnet list --compartment-id "$TENANCY" \
  --query 'data[?"prohibit-public-ip-on-vnic"==`false`]|[0].id' --raw-output)
imagen=$(oci compute image list --compartment-id "$TENANCY" \
  --operating-system "Canonical Ubuntu" --operating-system-version "24.04" \
  --shape VM.Standard.A1.Flex --sort-by TIMECREATED \
  --query 'data[0].id' --raw-output)

if [ -z "$subnet" ] || [ "$subnet" = "null" ]; then
  echo "No hay ninguna subnet publica en la tenancy."
  echo "Crea la red en la consola con Networking > VCN wizard >"
  echo "'VCN with Internet Connectivity' (deja los valores por defecto) y repite."
  exit 1
fi

# cloud-init: deja Docker listo en el primer arranque, para no entrar por SSH
# solo a instalar paquetes.
init=$(base64 -w0 <<'CLOUDINIT'
#cloud-config
package_update: true
packages:
  - docker.io
  - docker-compose-v2
  - postgresql-client
runcmd:
  - usermod -aG docker ubuntu
  - systemctl enable --now docker
CLOUDINIT
)

echo "AD=$ad  subnet=$subnet"
echo "Intentando $NOMBRE con $OCPUS OCPU / $MEM GB cada ${ESPERA}s. Ctrl+C para parar."

intento=0
while true; do
  intento=$((intento + 1))
  salida=$(oci compute instance launch \
    --compartment-id "$TENANCY" \
    --availability-domain "$ad" \
    --subnet-id "$subnet" \
    --image-id "$imagen" \
    --display-name "$NOMBRE" \
    --shape VM.Standard.A1.Flex \
    --shape-config "{\"ocpus\":$OCPUS,\"memoryInGBs\":$MEM}" \
    --boot-volume-size-in-gbs 100 \
    --assign-public-ip true \
    --metadata "{\"ssh_authorized_keys\":\"$(cat "$LLAVE")\",\"user_data\":\"$init\"}" \
    --wait-for-state RUNNING 2>&1) && {
      echo "$salida"
      echo
      echo "Lista tras $intento intento(s). IP publica:"
      oci compute instance list-vnics --instance-id \
        "$(echo "$salida" | grep -o 'ocid1\.instance\.[a-z0-9.]*' | head -1)" \
        --query 'data[0]."public-ip"' --raw-output
      exit 0
    }

  # Solo lo transitorio justifica reintentar; un OCID malo o una cuota agotada
  # fallarian igual para siempre y hay que verlos, no enterrarlos.
  #   - out of capacity: no hay hosts ARM libres ahora mismo.
  #   - TooManyRequests: Oracle limita la tasa de launch por usuario. Se espera
  #     el doble, porque insistir al mismo ritmo solo alarga el bloqueo.
  espera=$ESPERA
  if echo "$salida" | grep -qi "TooManyRequests"; then
    espera=$((ESPERA * 2))
    motivo="rate limit"
  # Oracle usa varias redacciones para lo mismo ("Out of capacity for shape...",
  # "Out of host capacity.") y hasta codigos distintos (429, 500 InternalError),
  # asi que se busca la palabra y no una frase exacta.
  elif echo "$salida" | grep -qi "capacity"; then
    motivo="sin capacidad"
  else
    echo "$salida" >&2
    exit 1
  fi
  printf '\rintento %d %s, esperando %ss (%s)' \
    "$intento" "$motivo" "$espera" "$(date +%H:%M:%S)"
  sleep "$espera"
done
