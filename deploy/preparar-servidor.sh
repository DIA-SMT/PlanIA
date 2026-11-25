#!/usr/bin/env bash
# Preparación única de PlanIA en la VPS (195.35.42.168). Se corre como root.
#
#   bash preparar-servidor.sh
#
# Hace lo que no depende del código: usuario de sistema, carpetas, .env vacío,
# ecosystem de pm2, script de despliegue y el sitio nginx SÓLO por HTTP (para
# que certbot pueda sacar el certificado). No arranca la app ni toca otros
# proyectos. Se puede volver a correr: lo que ya existe lo deja como está.
#
# Variables opcionales: PUERTO (3014) y DOMINIO (plania.195-35-42-168.sslip.io).
set -euo pipefail

PROYECTO=plania
PUERTO=${PUERTO:-3014}
DOMINIO=${DOMINIO:-plania.195-35-42-168.sslip.io}
BASE=/srv/$PROYECTO
AQUI=$(cd "$(dirname "$0")" && pwd)

falla() { echo "ERROR: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || falla "correr como root"
for f in ecosystem.config.js nginx-plania-http.conf desplegar.sh; do
  [ -f "$AQUI/$f" ] || falla "falta $AQUI/$f"
done

# --- 1. El puerto tiene que estar libre: que no escuche nadie y que ninguna
# configuración de otro proyecto lo reserve (una app parada no escucha).
# Si PlanIA ya está instalada en ese puerto, el que escucha es ella misma.
if grep -qs -- "-p $PUERTO " "$BASE/ecosystem.config.js"; then
  echo "PlanIA ya usa el puerto $PUERTO."
elif ss -ltn | awk 'NR>1 {print $4}' | grep -qE "[:.]${PUERTO}\$"; then
  falla "el puerto $PUERTO ya está escuchando (ss -ltnp | grep :$PUERTO)"
fi
RESERVA=$(grep -lsw -- "$PUERTO" /etc/nginx/sites-available/* /srv/*/ecosystem.config.js \
  | grep -v -e "^$BASE/" -e "/sites-available/$PROYECTO\$" || true)
[ -z "$RESERVA" ] || falla "el puerto $PUERTO aparece en: $RESERVA"
echo "Puerto $PUERTO: ningún otro proyecto lo usa."

# --- 2. Usuario y carpetas. 751 en la raíz: nginx (www-data) tiene que poder
# atravesarla para servir .next/static, aunque no pueda listarla.
if ! id "$PROYECTO" >/dev/null 2>&1; then
  adduser --system --group --home "$BASE" --shell /bin/bash "$PROYECTO"
fi
mkdir -p "$BASE"/{versiones,compartido,registros}
chown "$PROYECTO:$PROYECTO" "$BASE" "$BASE"/{versiones,compartido,registros}
chmod 751 "$BASE"
chmod 750 "$BASE/compartido"

# --- 3. .env vacío, sólo del usuario del proyecto. Lo completa una persona.
if [ ! -f "$BASE/compartido/.env" ]; then
  install -o "$PROYECTO" -g "$PROYECTO" -m 600 /dev/null "$BASE/compartido/.env"
  echo "Creado $BASE/compartido/.env (vacío): completarlo con nano antes de desplegar."
fi

# --- 4. ecosystem de pm2 con el puerto.
sed "s/__PUERTO__/$PUERTO/g" "$AQUI/ecosystem.config.js" > "$BASE/ecosystem.config.js"
chown "$PROYECTO:$PROYECTO" "$BASE/ecosystem.config.js"
chmod 644 "$BASE/ecosystem.config.js"

# --- 5. Script de despliegue. Va en /usr/local/sbin y es de root: lo corre
# root, así que el usuario del proyecto no tiene que poder cambiarlo.
sed -e "s/__PUERTO__/$PUERTO/g" -e "s/__DOMINIO__/$DOMINIO/g" "$AQUI/desplegar.sh" \
  > /usr/local/sbin/desplegar-plania
chmod 755 /usr/local/sbin/desplegar-plania
chown root:root /usr/local/sbin/desplegar-plania

# --- 6. Sitio nginx sólo HTTP. Si ya existe (por ejemplo ya con HTTPS), no se pisa.
SITIO=/etc/nginx/sites-available/$PROYECTO
if [ ! -f "$SITIO" ]; then
  sed -e "s/__PUERTO__/$PUERTO/g" -e "s/__DOMINIO__/$DOMINIO/g" \
    "$AQUI/nginx-plania-http.conf" > "$SITIO"
  ln -sfn "$SITIO" /etc/nginx/sites-enabled/$PROYECTO
  nginx -t
  systemctl reload nginx
  echo "Sitio nginx HTTP habilitado para $DOMINIO."
else
  echo "El sitio $SITIO ya existía: no se tocó."
fi

echo
echo "Listo. Siguientes pasos (ver DEPLOY.md):"
echo "  1. nano $BASE/compartido/.env"
echo "  2. desplegar-plania"
echo "  3. certbot certonly --nginx -d $DOMINIO --deploy-hook 'systemctl reload nginx'"
echo "     y después instalar nginx-plania.conf"
