#!/usr/bin/env bash
# Despliegue de PlanIA en la VPS. preparar-servidor.sh lo instala como
# /usr/local/sbin/desplegar-plania (de root). Se corre como root:
#
#   desplegar-plania              despliega la punta de main
#   desplegar-plania otra-rama    despliega otra rama (para probar)
#   desplegar-plania --volver     vuelve a la versión anterior a la actual
#   desplegar-plania --volver 20261125-101500-abc1234   a una versión puntual
#
# Cada despliegue es una carpeta nueva en versiones/ con fecha y commit; el
# enlace "actual" apunta a la viva. Si la compilación falla, "actual" no se
# mueve y la app sigue con la versión anterior.
set -euo pipefail

PROYECTO=plania
REPO=https://github.com/DIA-SMT/PlanIA.git
BASE=/srv/$PROYECTO
PUERTO=__PUERTO__
DOMINIO=__DOMINIO__
CONSERVAR=3

falla() { echo "ERROR: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || falla "correr como root"
# sudo conserva la carpeta actual y el usuario del proyecto no puede entrar a
# /root: pm2 fallaría con "spawn node EACCES". Siempre desde la base.
cd "$BASE"
como() { sudo -u "$PROYECTO" -H "$@"; }

recargar() {
  if como pm2 describe "$PROYECTO" >/dev/null 2>&1; then
    como pm2 reload "$PROYECTO" --update-env
  else
    como pm2 start "$BASE/ecosystem.config.js"
  fi
  como pm2 save >/dev/null
  # Esperar a que responda en local (hasta 60 s).
  for _ in $(seq 1 30); do
    if curl -fs -o /dev/null "http://127.0.0.1:$PUERTO/login"; then
      echo "PlanIA responde en 127.0.0.1:$PUERTO."
      return 0
    fi
    sleep 2
  done
  falla "PlanIA no responde en 127.0.0.1:$PUERTO. Mirar $BASE/registros/error.log"
}

# --- Volver atrás --------------------------------------------------------
if [ "${1:-}" = "--volver" ]; then
  ACTUAL=$(basename "$(readlink -f actual)")
  if [ -n "${2:-}" ]; then
    DESTINO=$2
  else
    DESTINO=$(ls -1 versiones | grep -v '^\.' | sort | awk -v a="$ACTUAL" '$0==a {print p; exit} {p=$0}' || true)
  fi
  [ -n "$DESTINO" ] || falla "no hay versión anterior a $ACTUAL"
  [ -f "versiones/$DESTINO/.next/BUILD_ID" ] || falla "versiones/$DESTINO no existe o no está compilada"
  echo "Volviendo de $ACTUAL a $DESTINO"
  ln -sfn "$BASE/versiones/$DESTINO" actual
  recargar
  exit 0
fi

# --- Desplegar -----------------------------------------------------------
RAMA=${1:-main}
[ -s compartido/.env ] || falla "compartido/.env está vacío: completarlo antes"

EN_CURSO=versiones/.armando-$$
limpiar() { if [ -n "${EN_CURSO:-}" ]; then rm -rf "${BASE:?}/$EN_CURSO"; fi; }
trap limpiar EXIT

echo "Clonando $RAMA…"
como git clone --quiet --depth 1 --branch "$RAMA" "$REPO" "$EN_CURSO"
SHA=$(como git -C "$EN_CURSO" rev-parse --short=7 HEAD)
VER=versiones/$(date +%Y%m%d-%H%M%S)-$SHA
mv "$EN_CURSO" "$VER"
EN_CURSO=$VER   # si algo falla de acá en adelante, se borra la versión a medias

cd "$BASE/$VER"
como ln -s ../../compartido/.env .env
echo "Instalando dependencias…"
como npm ci --include=dev --no-audit --no-fund
echo "Compilando…"
# Las NEXT_PUBLIC_* se graban en la compilación: salen del .env enlazado.
como npm run build
cd "$BASE"

ln -sfn "$BASE/$VER" actual
EN_CURSO=""   # ya está viva: no se borra
echo "actual -> $VER"
recargar

# Conservar las últimas $CONSERVAR versiones, nunca la que está viva.
VIVA=$(basename "$(readlink -f actual)")
{ ls -1 versiones | grep -v '^\.' | sort -r | tail -n +$((CONSERVAR + 1)) | grep -vx "$VIVA" \
  | xargs -r -I{} rm -rf "versiones/{}"; } || true

echo
echo "Desplegado $SHA ($RAMA). Verificación pública:"
if [ -f "$BASE/actual/deploy/verificar.sh" ]; then
  bash "$BASE/actual/deploy/verificar.sh" "$DOMINIO" || true
else
  echo "(esta versión no trae deploy/verificar.sh: verificar a mano)"
fi
