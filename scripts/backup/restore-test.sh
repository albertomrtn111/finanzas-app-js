#!/usr/bin/env bash
# Prueba de restauración: recupera una copia en un Postgres de usar y tirar y comprueba
# que están todas las tablas con las mismas filas que tenían al hacer la copia.
# No toca la base de datos real.
#
# Uso:
#   scripts/backup/restore-test.sh                 # prueba la copia diaria más reciente
#   scripts/backup/restore-test.sh <fichero.dump>  # prueba una copia concreta
# En el servidor, el día 1 de cada mes a las 04:40:
#   40 4 1 * * /srv/finanzas-app-js/scripts/backup/restore-test.sh 2>&1 | logger -t finanzas-backup
set -Eeuo pipefail
umask 077

CONFIG_FILE="${BACKUP_CONFIG:-/srv/finanzas-app-js-backups/backup.env}"
# shellcheck source=/dev/null
[[ -f "$CONFIG_FILE" ]] && source "$CONFIG_FILE"

BACKUP_DIR="${BACKUP_DIR:-/srv/finanzas-app-js-backups/automaticas}"
PG_IMAGE="${PG_IMAGE:-postgres:15}"
container="finanzas_restore_test_$$"

log() { echo "[$(date '+%F %T')] $*"; }
fail() {
    log "ERROR en la prueba de restauración: $*"
    printf '%s\tFALLO\t%s\n' "$(date -Is)" "$*" > "$BACKUP_DIR/ultima-restauracion.txt"
    exit 1
}
cleanup() { docker rm -f "$container" > /dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'fail "interrumpida en la línea $LINENO"' ERR

dump="${1:-}"
if [[ -z "$dump" ]]; then
    dump="$(find "$BACKUP_DIR/diarias" -maxdepth 1 -name 'finanzas-*.dump' | sort | tail -n 1)"
fi
[[ -n "$dump" && -s "$dump" ]] || fail "no hay ninguna copia que probar"
base="${dump%.dump}"
name="$(basename "$base")"

# 1. La copia no se ha alterado desde que se hizo.
if [[ -f "$base.sha256" ]]; then
    (cd "$(dirname "$dump")" && sha256sum --quiet -c "$name.sha256") || fail "la suma de comprobación de $name no coincide"
fi

# 2. Restaurarla en un Postgres aislado, sin red.
log "Restaurando $name en un contenedor temporal ($PG_IMAGE)"
docker run -d --name "$container" --network none -e POSTGRES_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')" "$PG_IMAGE" > /dev/null
# Durante la inicialización la imagen arranca un servidor temporal solo por socket y lo
# reinicia; se espera a que escuche por TCP, que ya es el servidor definitivo.
for _ in $(seq 1 60); do
    docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -q 2> /dev/null && break
    sleep 1
done
docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -q || fail "el Postgres temporal no arranca"
docker exec "$container" createdb -U postgres restaurada
docker exec -i "$container" pg_restore -U postgres -d restaurada --no-owner --no-acl --exit-on-error < "$dump" \
    || fail "pg_restore no ha podido recuperar $name: la copia está dañada o incompleta"

# 3. Comparar las filas de cada tabla con las que había al hacer la copia.
docker exec "$container" psql -U postgres -d restaurada -At -F $'\t' -c "
    SELECT table_name,
           (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', table_name), false, true, '')))[1]::text::bigint
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name" > "$BACKUP_DIR/.tmp/restaurada.filas"

if [[ -f "$base.filas" ]]; then
    if ! diff_out="$(diff "$base.filas" "$BACKUP_DIR/.tmp/restaurada.filas")"; then
        fail "las filas restauradas no coinciden con las de la copia: $(echo "$diff_out" | tr '\n' ' ')"
    fi
    detail="$(wc -l < "$base.filas" | tr -d ' ') tablas y $(awk -F'\t' '{s+=$2} END {print s}' "$base.filas") filas iguales que en la copia"
else
    detail="$(wc -l < "$BACKUP_DIR/.tmp/restaurada.filas" | tr -d ' ') tablas restauradas (la copia no tenía recuento de filas)"
fi
rm -f "$BACKUP_DIR/.tmp/restaurada.filas"

printf '%s\tOK\t%s\t%s\n' "$(date -Is)" "$name" "$detail" > "$BACKUP_DIR/ultima-restauracion.txt"
log "Restauración correcta de $name: $detail"
