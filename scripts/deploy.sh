#!/usr/bin/env bash
# Despliegue de NextFinance en el servidor, con copia previa y vuelta atrás automática.
#
# Uso (en /srv/finanzas-app-js):
#   scripts/deploy.sh                 # despliega origin/main
#   scripts/deploy.sh --plan          # solo dice qué haría, sin tocar nada
#   scripts/deploy.sh --volver <sha>  # vuelve a una imagen anterior ya construida
#
# Pasos: copia de la base de datos → actualizar el código (solo avance rápido) → construir la
# imagen etiquetada con su commit → aplicar migraciones → arrancar → comprobar /api/health.
# Si la imagen no se construye, las migraciones fallan o la app no responde sana con la versión
# nueva, vuelve solo al código y a la imagen anteriores. Las migraciones aplicadas no se
# deshacen (son solo hacia delante); la copia de la base de datos está para eso.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/srv/finanzas-app-js}"
IMAGE="${IMAGE:-finanzas-app-js-web}"
CONTAINER="${CONTAINER:-finanzas_next}"
REF="${DEPLOY_REF:-origin/main}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"
cd "$APP_DIR"

log() { echo "[$(date '+%F %T')] $*"; }
die() { log "ERROR: $*"; exit 1; }

exec 8> "$APP_DIR/.deploy.lock"
flock -n 8 || die "ya hay otro despliegue en marcha"

health_version() {
    docker exec "$CONTAINER" wget -qO- http://127.0.0.1:3000/api/health 2> /dev/null \
        | sed -n 's/.*"estado":"ok".*"version":"\([0-9a-f]*\)".*/\1/p'
}

wait_healthy() {
    local expected="$1" waited=0 version
    while (( waited < HEALTH_TIMEOUT )); do
        version="$(health_version || true)"
        if [[ "$version" == "$expected" ]]; then return 0; fi
        sleep 3; waited=$((waited + 3))
    done
    return 1
}

# Las versiones anteriores a /api/health solo se pueden comprobar por la página de entrada.
responds() {
    local waited=0
    while (( waited < HEALTH_TIMEOUT )); do
        if docker exec "$CONTAINER" wget -qO /dev/null http://127.0.0.1:3000/login 2> /dev/null; then return 0; fi
        sleep 3; waited=$((waited + 3))
    done
    return 1
}

start_image() {
    local tag="$1"
    docker tag "$IMAGE:$tag" "$IMAGE:latest"
    docker compose up -d --no-deps --no-build web
}

if [[ "${1:-}" == "--volver" ]]; then
    target="${2:?Indica el commit de la imagen a la que volver}"
    target="${target:0:7}"
    docker image inspect "$IMAGE:$target" > /dev/null 2>&1 || die "no existe la imagen $IMAGE:$target"
    log "Volviendo a la imagen $IMAGE:$target"
    start_image "$target"
    wait_healthy "$target" || responds || die "la imagen $target no responde"
    log "En marcha $target. El código del servidor sigue en $(git rev-parse --short HEAD): actualízalo si hace falta."
    exit 0
fi

git fetch --quiet origin
current="$(git rev-parse --short=7 HEAD)"
target="$(git rev-parse --short=7 "$REF")"
running="$(health_version || true)"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    die "hay cambios sin guardar en $APP_DIR; revísalos antes de desplegar"
fi
git merge-base --is-ancestor HEAD "$REF" || die "$REF no avanza desde $current (¿historia reescrita?); revísalo a mano"

log "En marcha: ${running:-desconocida} · código: $current · a desplegar: $target"
if [[ "$current" == "$target" && "$running" == "$target" ]]; then
    log "Ya está desplegada la última versión"
    exit 0
fi
if [[ "${1:-}" == "--plan" ]]; then
    log "Plan: copia de la base de datos, avanzar de $current a $target, construir $IMAGE:$target, migraciones, arrancar y comprobar salud"
    git log --oneline "$current..$target" | sed 's/^/    /'
    git diff --stat "$current..$target" -- prisma/migrations | sed 's/^/    migraciones: /'
    exit 0
fi

# 1. Copia de la base de datos y de la imagen en marcha.
log "Copia de seguridad previa"
"$APP_DIR/scripts/backup/backup-db.sh"
previous_tag="${running:-$current}"
if ! docker image inspect "$IMAGE:$previous_tag" > /dev/null 2>&1; then
    docker tag "$IMAGE:latest" "$IMAGE:$previous_tag"
fi
log "Imagen anterior guardada como $IMAGE:$previous_tag"

rollback() {
    log "VOLVIENDO ATRÁS a $previous_tag"
    git reset --quiet --keep "$current"
    start_image "$previous_tag"
    if wait_healthy "$previous_tag" || responds; then
        log "Vuelta atrás completada: en marcha $previous_tag"
    else
        log "ATENCIÓN: la versión anterior tampoco responde sana. Revisa: docker logs $CONTAINER"
    fi
    exit 1
}

# 2. Código nuevo. Si el servidor tiene sin versionar ficheros que el repositorio ya incluye
# (el Dockerfile y el compose, la primera vez), se apartan para que el avance no falle.
stash_dir="$APP_DIR/.antes-del-despliegue/$(date +%Y%m%d-%H%M%S)"
while IFS= read -r file; do
    if git cat-file -e "$REF:$file" 2> /dev/null; then
        mkdir -p "$stash_dir/$(dirname "$file")"
        mv "$file" "$stash_dir/$file"
        log "Apartado $file (ahora lo trae el repositorio) en $stash_dir"
    fi
done < <(git ls-files --others --exclude-standard)
git merge --quiet --ff-only "$REF"

# 3. Imagen nueva, etiquetada con su commit.
log "Construyendo $IMAGE:$target"
if ! GIT_COMMIT="$(git rev-parse HEAD)" docker compose build web; then
    log "La imagen no se ha podido construir"
    rollback
fi
docker tag "$IMAGE:latest" "$IMAGE:$target"

# 4. Migraciones (solo las pendientes).
log "Aplicando migraciones"
# Sin la etiqueta de Traefik, para que no le mande tráfico mientras migra.
if ! docker compose run --rm --no-deps -T -l traefik.enable=false web npx prisma migrate deploy; then
    log "Las migraciones han fallado"
    rollback
fi

# 5. Arrancar y comprobar.
log "Arrancando $target"
docker compose up -d --no-deps --no-build web
if ! wait_healthy "$target"; then
    log "La versión $target no responde sana en ${HEALTH_TIMEOUT}s"
    docker logs --tail 30 "$CONTAINER" 2>&1 | sed 's/^/    /'
    rollback
fi

# 6. Limpieza: conservar las 5 imágenes etiquetadas más recientes.
docker images "$IMAGE" --format '{{.CreatedAt}}|{{.Tag}}' | sort -r | awk -F'|' '$2 ~ /^[0-9a-f]{7}$/ {print $2}' | tail -n +6 \
    | while read -r old; do
        [[ "$old" == "$target" || "$old" == "$previous_tag" ]] && continue
        docker rmi "$IMAGE:$old" > /dev/null 2>&1 && log "Borrada imagen antigua $old"
    done || true

log "Desplegado $target correctamente (antes: $previous_tag). Para volver: scripts/deploy.sh --volver $previous_tag"
