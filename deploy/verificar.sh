#!/usr/bin/env bash
# Las tres pruebas después de cada despliegue. Sirve desde el servidor o desde
# Git Bash en Windows:
#
#   bash deploy/verificar.sh plania.195-35-42-168.sslip.io
#
# Tiene que dar: 200 en la página, 200 en su CSS y 404 en los cuatro archivos
# que no deben verse. Un CSS en 403 es la carpeta /srv/plania sin el permiso 751.
# Y después hay que abrir el sitio en el navegador y mirarlo.
set -uo pipefail
D=${1:?Uso: verificar.sh <dominio>}
MAL=0

estado() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1"; }
prueba() { # $1 nombre  $2 esperado  $3 url
  local r; r=$(estado "$3")
  if [ "$r" = "$2" ]; then printf '  ok   %-26s %s\n' "$1" "$r"
  else printf '  MAL  %-26s %s (esperaba %s)\n' "$1" "$r" "$2"; MAL=1; fi
}

echo "Verificando https://$D"
# La portada redirige a /login sin sesión; /login es la página pública.
prueba "página /login" 200 "https://$D/login"
CSS=$(curl -s --max-time 20 "https://$D/login" | grep -o '/_next/static/[^"]*\.css' | head -1)
if [ -n "$CSS" ]; then prueba "su CSS" 200 "https://$D$CSS"
else echo "  MAL  no se encontró CSS en /login"; MAL=1; fi
for r in /.env /.env.local /.git/config /package.json; do
  prueba "$r" 404 "https://$D$r"
done
prueba "http redirige a https" 301 "http://$D/login"

[ "$MAL" = 0 ] && echo "Todo bien." || echo "Hay pruebas que fallaron."
exit "$MAL"
