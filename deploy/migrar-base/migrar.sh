#!/usr/bin/env bash
# Pasa la base de PlanIA del proyecto de Supabase de us-east-1 al Supabase
# instalado en la propia VPS (/srv/plania/supabase). Se corre en la VPS, que
# tiene pg_dump/psql 17 y llega por IPv6 a la conexión directa del proyecto
# viejo. Ver MIGRAR-BASE.md.
#
#   migrar.sh comprobar   revisa versiones, extensiones y que la nueva esté vacía
#   migrar.sh volcar      vuelca la base vieja (no la toca: solo lee)
#   migrar.sh restaurar   carga el volcado en la nueva, todo en una transacción
#   migrar.sh comparar    cuenta filas tabla por tabla en las dos y las compara
#
# Las cadenas de conexión NO van en este archivo ni en el repo: se leen de
# $CARPETA/conexiones (modo 600), que se carga a mano antes de empezar:
#   VIEJA_DB='postgresql://postgres:...@db.hesoeuyxxyfxwpjyunnz.supabase.co:5432/postgres'
#   NUEVA_DB='postgresql://postgres:...@127.0.0.1:5433/postgres'
#   (la del Supabase de la VPS: la clave es POSTGRES_PASSWORD de
#   /srv/plania/supabase/.env)
#
# Qué se lleva:
#   - esquemas public y api completos (tablas, funciones, triggers, RLS, grants)
#   - auth.users y auth.identities (con las contraseñas cifradas: nadie tiene
#     que cambiar la suya, solo volver a entrar)
#   - el bucket y las políticas de storage de la migración 055 (storage.sql)
# Qué no: sesiones abiertas, el registro de auditoría de auth y los archivos de
# storage (hoy no hay ninguno; si aparece alguno, copiar-archivos.mjs).

set -euo pipefail

PGBIN=/usr/lib/postgresql/17/bin
CARPETA=${CARPETA:-/root/migrar-plania}
AQUI=$(cd "$(dirname "$0")" && pwd)

if [ -z "${VIEJA_DB:-}" ] || [ -z "${NUEVA_DB:-}" ]; then
  if [ -f "$CARPETA/conexiones" ]; then
    # shellcheck disable=SC1091
    . "$CARPETA/conexiones"
  fi
fi
: "${VIEJA_DB:?Falta VIEJA_DB (ver $CARPETA/conexiones)}"
: "${NUEVA_DB:?Falta NUEVA_DB (ver $CARPETA/conexiones)}"

if [ "$VIEJA_DB" = "$NUEVA_DB" ]; then
  echo "VIEJA_DB y NUEVA_DB son la misma base. No sigo." >&2
  exit 1
fi

mkdir -p "$CARPETA"
chmod 700 "$CARPETA"
umask 077

vieja() { "$PGBIN/psql" "$VIEJA_DB" -X -v ON_ERROR_STOP=1 -At "$@"; }
nueva() { "$PGBIN/psql" "$NUEVA_DB" -X -v ON_ERROR_STOP=1 -At "$@"; }

SQL_EXTENSIONES="SELECT e.extname || ' en ' || n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY 1"

SQL_TABLAS_APP="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','api')"

# Filas por tabla, más un resumen de objetos. Es lo que se compara al final.
SQL_CONTEO="
SELECT n.nspname || '.' || c.relname || ' ' ||
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND (n.nspname IN ('public','api') OR (n.nspname = 'auth' AND c.relname IN ('users','identities')))
UNION ALL
SELECT '~funciones ' || count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public','api')
UNION ALL
SELECT '~politicas ' || count(*) FROM pg_policies WHERE schemaname IN ('public','api','storage')
UNION ALL
SELECT '~triggers ' || count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','api')
UNION ALL
SELECT '~vistas ' || count(*) FROM pg_views WHERE schemaname IN ('public','api')
UNION ALL
SELECT '~buckets ' || count(*) FROM storage.buckets
ORDER BY 1"

comprobar() {
  echo "== Herramientas"
  "$PGBIN/pg_dump" --version
  "$PGBIN/psql" --version

  echo "== Versión del servidor"
  echo "vieja: $(vieja -c 'SHOW server_version')"
  echo "nueva: $(nueva -c 'SHOW server_version')"

  echo "== Extensiones"
  vieja -c "$SQL_EXTENSIONES" > "$CARPETA/ext-vieja.txt"
  nueva -c "$SQL_EXTENSIONES" > "$CARPETA/ext-nueva.txt"
  local faltan
  faltan=$(comm -23 "$CARPETA/ext-vieja.txt" "$CARPETA/ext-nueva.txt" || true)
  if [ -n "$faltan" ]; then
    echo "En la nueva faltan estas extensiones (o están en otro esquema):" >&2
    echo "$faltan" >&2
    echo "Habilitarlas en Database → Extensions del proyecto nuevo y volver a comprobar." >&2
    exit 1
  fi
  echo "ok: la nueva tiene todas las de la vieja"

  echo "== La nueva tiene que estar vacía"
  local tablas
  tablas=$(nueva -c "$SQL_TABLAS_APP")
  if [ "$tablas" != "0" ]; then
    echo "La nueva ya tiene $tablas tablas en public/api. No restauro encima de algo." >&2
    exit 1
  fi
  local usuarios
  usuarios=$(nueva -c "SELECT count(*) FROM auth.users")
  if [ "$usuarios" != "0" ]; then
    echo "La nueva ya tiene $usuarios usuarios en auth.users. No restauro encima de algo." >&2
    exit 1
  fi
  echo "ok: vacía"

  echo "== La vieja"
  echo "tamaño: $(vieja -c 'SELECT pg_size_pretty(pg_database_size(current_database()))')"
  echo "usuarios: $(vieja -c 'SELECT count(*) FROM auth.users')"
  echo "archivos en storage: $(vieja -c 'SELECT count(*) FROM storage.objects')"
}

volcar() {
  echo "== Esquema (public y api)"
  "$PGBIN/pg_dump" "$VIEJA_DB" --schema-only --schema=public --schema=api \
    --no-owner --quote-all-identifiers -f "$CARPETA/esquema.sql"
  # public ya existe en todo proyecto de Supabase, y su comentario es de otro
  # dueño; api la crea la 015, pero que no falle si ya estuviera. Los permisos
  # por defecto de supabase_admin los pone Supabase solo, y postgres no puede
  # tocarlos (lo mismo que saca el CLI de Supabase al volcar).
  sed -i -E \
    -e 's/^CREATE SCHEMA "public";/-- &/' \
    -e 's/^COMMENT ON SCHEMA "public" .*/-- &/' \
    -e 's/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"/-- &/' \
    -e 's/^CREATE SCHEMA "api";/CREATE SCHEMA IF NOT EXISTS "api";/' \
    "$CARPETA/esquema.sql"

  echo "== Datos de la app (public y api)"
  "$PGBIN/pg_dump" "$VIEJA_DB" --data-only --schema=public --schema=api \
    --quote-all-identifiers -f "$CARPETA/datos-app.sql"

  echo "== Usuarios (auth.users y auth.identities)"
  "$PGBIN/pg_dump" "$VIEJA_DB" --data-only --table=auth.users --table=auth.identities \
    --quote-all-identifiers -f "$CARPETA/datos-auth.sql"

  echo "== Conteo de la vieja"
  vieja -c "$SQL_CONTEO" > "$CARPETA/conteo-vieja.txt"

  ls -la "$CARPETA"
  echo "Listo. Los volcados tienen las contraseñas cifradas de los usuarios: borrar $CARPETA al terminar."
}

restaurar() {
  for f in esquema.sql datos-auth.sql datos-app.sql; do
    [ -s "$CARPETA/$f" ] || { echo "Falta $CARPETA/$f: correr primero 'volcar'." >&2; exit 1; }
  done
  local tablas
  tablas=$(nueva -c "$SQL_TABLAS_APP")
  if [ "$tablas" != "0" ]; then
    echo "La nueva ya tiene $tablas tablas en public/api. No restauro encima de algo." >&2
    exit 1
  fi

  # Todo o nada: si algo falla, la nueva queda como estaba.
  # session_replication_role = replica apaga los triggers y las claves foráneas
  # mientras se cargan los datos (así lo indica la guía de Supabase).
  "$PGBIN/psql" "$NUEVA_DB" -X -v ON_ERROR_STOP=1 --single-transaction \
    -f "$CARPETA/esquema.sql" \
    -c 'SET session_replication_role = replica' \
    -f "$CARPETA/datos-auth.sql" \
    -f "$CARPETA/datos-app.sql" \
    -c 'SET session_replication_role = origin' \
    -f "$AQUI/storage.sql"

  nueva -c "NOTIFY pgrst, 'reload schema'"
  echo "Restaurada. Ahora: migrar.sh comparar"
}

comparar() {
  [ -s "$CARPETA/conteo-vieja.txt" ] || vieja -c "$SQL_CONTEO" > "$CARPETA/conteo-vieja.txt"
  nueva -c "$SQL_CONTEO" > "$CARPETA/conteo-nueva.txt"
  if diff "$CARPETA/conteo-vieja.txt" "$CARPETA/conteo-nueva.txt"; then
    echo "ok: las $(wc -l < "$CARPETA/conteo-vieja.txt") líneas coinciden (filas por tabla, funciones, políticas, triggers, vistas, buckets)"
  else
    echo "Hay diferencias (arriba: < vieja, > nueva). Revisar antes de cambiar la app." >&2
    exit 1
  fi
}

case "${1:-}" in
  comprobar) comprobar ;;
  volcar) volcar ;;
  restaurar) restaurar ;;
  comparar) comparar ;;
  *)
    echo "Uso: $0 comprobar|volcar|restaurar|comparar" >&2
    exit 1
    ;;
esac
