#!/usr/bin/env bash
# Copia de seguridad diaria de la base de datos de NextFinance.
#
# Hace un pg_dump del contenedor de Postgres, comprueba que se puede leer, guarda
# cuántas filas tenía cada tabla y rota las copias: 7 diarias, 4 semanales (domingo)
# y 12 mensuales (día 1). Si hay un destino externo configurado, sube además una
# copia cifrada con gpg mediante rclone.
#
# Uso en el servidor (cron, todos los días a las 03:15):
#   15 3 * * * /srv/finanzas-app-js/scripts/backup/backup-db.sh 2>&1 | logger -t finanzas-backup
#
# Configuración opcional en /srv/finanzas-app-js-backups/backup.env (no va al repositorio):
#   BACKUP_REMOTE=remoto:carpeta            destino de rclone para la copia fuera del servidor
#   BACKUP_PASSPHRASE_FILE=/ruta/clave      clave con la que gpg cifra lo que sale del servidor
set -Eeuo pipefail
umask 077

CONFIG_FILE="${BACKUP_CONFIG:-/srv/finanzas-app-js-backups/backup.env}"
# shellcheck source=/dev/null
[[ -f "$CONFIG_FILE" ]] && source "$CONFIG_FILE"

PG_CONTAINER="${PG_CONTAINER:-finanzas_postgres}"
PG_USER="${PG_USER:-appuser}"
PG_DB="${PG_DB:-finanzas}"
BACKUP_DIR="${BACKUP_DIR:-/srv/finanzas-app-js-backups/automaticas}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"
MIN_TABLES="${MIN_TABLES:-20}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
BACKUP_PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-}"

log() { echo "[$(date '+%F %T')] $*"; }
fail() {
    log "ERROR: $*"
    printf '%s\t%s\n' "$(date -Is)" "$*" > "$BACKUP_DIR/ultima-copia-ERROR.txt"
    exit 1
}
trap 'fail "la copia se ha interrumpido en la línea $LINENO"' ERR

mkdir -p "$BACKUP_DIR"/{diarias,semanales,mensuales,.tmp}
chmod 700 "$BACKUP_DIR"

# Una sola copia a la vez.
exec 9> "$BACKUP_DIR/.lock"
flock -n 9 || fail "ya hay otra copia en marcha"

stamp="$(date '+%Y-%m-%d_%H%M')"
name="finanzas-$stamp"
tmp="$BACKUP_DIR/.tmp/$name"
rm -f "$tmp".*

log "Volcando $PG_DB desde $PG_CONTAINER"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc > "$tmp.dump"
[[ -s "$tmp.dump" ]] || fail "el volcado está vacío"

# La copia tiene que poder leerse y tener todas las tablas con datos.
tables="$(docker exec -i "$PG_CONTAINER" pg_restore -l < "$tmp.dump" | grep -c ' TABLE DATA ' || true)"
(( tables >= MIN_TABLES )) || fail "la copia solo tiene $tables tablas con datos (mínimo $MIN_TABLES)"

# Filas por tabla, para comparar al restaurar.
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -At -F $'\t' -c "
    SELECT table_name,
           (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', table_name), false, true, '')))[1]::text::bigint
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name" > "$tmp.filas"
[[ -s "$tmp.filas" ]] || fail "no se pudieron contar las filas"

(cd "$BACKUP_DIR/.tmp" && sha256sum "$name.dump" > "$name.sha256")
mv "$tmp.dump" "$tmp.filas" "$tmp.sha256" "$BACKUP_DIR/diarias/"
log "Copia guardada: diarias/$name.dump ($(du -h "$BACKUP_DIR/diarias/$name.dump" | cut -f1), $tables tablas)"

# Semanal los domingos y mensual el día 1, como enlaces a la diaria (no ocupan más).
link_copy() {
    local dest="$1"
    for ext in dump filas sha256; do ln -f "$BACKUP_DIR/diarias/$name.$ext" "$BACKUP_DIR/$dest/$name.$ext"; done
    log "También como copia $dest"
}
if [[ "$(date +%u)" == 7 ]]; then link_copy semanales; fi
if [[ "$(date +%d)" == 01 ]]; then link_copy mensuales; fi

rotate() {
    local dir="$BACKUP_DIR/$1" keep="$2" old
    # Los nombres llevan la fecha, así que el orden alfabético es el cronológico.
    mapfile -t old < <(find "$dir" -maxdepth 1 -name 'finanzas-*.dump' -printf '%f\n' | sort -r | tail -n +"$((keep + 1))")
    for f in "${old[@]}"; do
        rm -f "$dir/${f%.dump}".{dump,filas,sha256}
        log "Rotada $1/$f"
    done
}
rotate diarias "$KEEP_DAILY"
rotate semanales "$KEEP_WEEKLY"
rotate mensuales "$KEEP_MONTHLY"

# Copia fuera del servidor, cifrada.
if [[ -n "$BACKUP_REMOTE" ]]; then
    [[ -r "$BACKUP_PASSPHRASE_FILE" ]] || fail "BACKUP_REMOTE está configurado pero falta BACKUP_PASSPHRASE_FILE"
    command -v rclone > /dev/null || fail "BACKUP_REMOTE está configurado pero rclone no está instalado"
    gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
        -o "$BACKUP_DIR/.tmp/$name.dump.gpg" "$BACKUP_DIR/diarias/$name.dump"
    cp "$BACKUP_DIR/diarias/$name.filas" "$BACKUP_DIR/diarias/$name.sha256" "$BACKUP_DIR/.tmp/"
    rclone copy "$BACKUP_DIR/.tmp/" "$BACKUP_REMOTE/" --include "$name.*"
    rm -f "$BACKUP_DIR/.tmp/$name".*
    log "Copia cifrada subida a $BACKUP_REMOTE"
else
    log "AVISO: no hay destino externo configurado (BACKUP_REMOTE); la copia solo está en este servidor"
fi

rm -f "$BACKUP_DIR/ultima-copia-ERROR.txt"
printf '%s\t%s\t%s tablas\t%s\n' "$(date -Is)" "diarias/$name.dump" "$tables" "${BACKUP_REMOTE:-solo local}" > "$BACKUP_DIR/ultima-copia.txt"
log "Copia terminada"
