#!/usr/bin/env bash
# Reconstruye el frontend y lo deja donde el backend lo sirve en local.
#
# Existe por un fallo real: el backend servia en localhost:8080 una copia de
# `dist` copiada a mano semanas atras, con los iconos inventados que se
# reemplazaron por el escudo del colegio. Nadie la regeneraba, asi que el
# navegador mostraba la aplicacion vieja y parecia que el cambio no habia
# funcionado. En Docker no pasa porque el Dockerfile copia `dist` en cada
# construccion; el agujero era solo el local.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> construyendo el frontend"
(cd app/frontend && npm run build)

DESTINOS=(app/backend/src/main/resources/static app/backend/target/classes/static)
for d in "${DESTINOS[@]}"; do
  # Se borra antes de copiar: los nombres de los bundles llevan hash, y sin
  # borrar se acumulan los viejos y el service worker puede servir uno rancio.
  rm -rf "$d"
  mkdir -p "$d"
  cp -r app/frontend/dist/. "$d"/
  echo "==> $d actualizado"
done

echo
echo "Listo. Reinicia el backend para que lo recoja."
echo
echo "OJO: la aplicacion instala un service worker que cachea el paquete anterior,"
echo "asi que el navegador puede seguir mostrando la version vieja aunque el fichero"
echo "en disco ya sea el nuevo. Esto nos ha enganado dos veces. Para verlo de verdad:"
echo "  - recarga forzada con Ctrl+Shift+R, o"
echo "  - DevTools > Application > Service Workers > Unregister, y recarga."
