#!/usr/bin/env bash
# SPM-185: create and destroy a disposable PostgreSQL database for automated tests.
#
# This is deliberately NOT the shared Docker Compose stack. Per docker-compose/AGENTS.md the
# Compose containers, networks and named volumes are shared state and are never torn down as
# test teardown; this script instead owns a separate throwaway container and removes it, and
# its anonymous data volume, by recorded identity.
#
# The container is built from this directory's Dockerfile, so the disposable database runs the
# same PostgreSQL major version and the same initialisation assets as the dev stack.
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly BUILD_CONTEXT="${REPO_ROOT}/database/postgresql"

# Recorded identity. Everything this script removes is matched on these, never on a bare name
# that could collide with a developer's own container.
readonly CONTAINER_NAME="${SPM_TEST_DB_CONTAINER:-spm-disposable-test-db}"
readonly IMAGE_TAG="${SPM_TEST_DB_IMAGE:-spm-disposable-test-db:local}"
readonly OWNER_LABEL="spm.test-db.owner=spm-185-test-db-script"

# 5432 is the dev stack's published port and 5433 has been used by hand-started test containers,
# so default clear of both. Override with SPM_TEST_DB_PORT.
readonly PORT="${SPM_TEST_DB_PORT:-55432}"
readonly DB_USER="${POSTGRES_USER:-spm}"
readonly DB_PASSWORD="${POSTGRES_PASSWORD:-spm_dev_password}"
readonly DB_NAME="${POSTGRES_DB:-spm}"

# Everything this database needs comes from the image's own init/ directory: 001_schema.sql (every
# table, including event_drafts), 002_seed_data.sql and 003_functions_triggers.sql, so there is
# nothing to mount here.

# Stamp the database so automated resets can prove they are pointed at a disposable database and
# not at a developer's. A dev database has no marker, so backend/scripts/testing/
# reset-test-database.mjs refuses to truncate it even if TEST_DATABASE_URL is set to it.
readonly MARKER_TABLE="spm_disposable_test_db"

stamp_marker() {
  docker exec --interactive "$CONTAINER_NAME" \
    psql --username "$DB_USER" --dbname "$DB_NAME" --quiet --no-psqlrc \
      --set ON_ERROR_STOP=1 >/dev/null <<SQL
CREATE TABLE IF NOT EXISTS ${MARKER_TABLE} (
  stamped_at timestamptz NOT NULL DEFAULT now(),
  owner text NOT NULL
);
INSERT INTO ${MARKER_TABLE} (owner) VALUES ('${OWNER_LABEL#*=}');
SQL
}

url() { printf 'postgresql://%s:%s@127.0.0.1:%s/%s\n' "$DB_USER" "$DB_PASSWORD" "$PORT" "$DB_NAME"; }

die() { printf 'test-db: %s\n' "$1" >&2; exit 1; }

require_docker() {
  command -v docker >/dev/null 2>&1 || die "docker is not on PATH."
  docker info >/dev/null 2>&1 || die "the Docker daemon is not reachable. Start Docker and retry."
}

container_exists() { docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; }

container_running() {
  [ "$(docker container inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || echo false)" = true ]
}

# Refuse to touch a container this script did not create, so an existing hand-started container
# of the same name is never silently removed.
assert_owned() {
  local owner
  owner="$(docker container inspect -f '{{index .Config.Labels "spm.test-db.owner"}}' "$CONTAINER_NAME" 2>/dev/null || true)"
  if [ "$owner" != "${OWNER_LABEL#*=}" ]; then
    die "container '${CONTAINER_NAME}' exists but was not created by this script (owner label: '${owner:-none}'). Remove it yourself, or set SPM_TEST_DB_CONTAINER to another name."
  fi
}

cmd_up() {
  require_docker
  if container_exists; then
    assert_owned
    if container_running; then
      printf 'test-db: reusing running container %s\n' "$CONTAINER_NAME" >&2
      stamp_marker
      url
      return 0
    fi
    printf 'test-db: removing stopped container %s\n' "$CONTAINER_NAME" >&2
    docker rm -v -f "$CONTAINER_NAME" >/dev/null
  fi

  printf 'test-db: building %s from %s\n' "$IMAGE_TAG" "${BUILD_CONTEXT#"$REPO_ROOT"/}" >&2
  docker build --quiet --tag "$IMAGE_TAG" "$BUILD_CONTEXT" >/dev/null

  # No named volume: the image declares a volume for PGDATA, so this run gets an anonymous one
  # that `docker rm -v` deletes. That is what makes the database disposable - initdb replays
  # every initialisation asset on each `up`, in the canonical order.
  printf 'test-db: starting %s on port %s\n' "$CONTAINER_NAME" "$PORT" >&2
  docker run --detach \
    --name "$CONTAINER_NAME" \
    --label "$OWNER_LABEL" \
    --env "POSTGRES_USER=${DB_USER}" \
    --env "POSTGRES_PASSWORD=${DB_PASSWORD}" \
    --env "POSTGRES_DB=${DB_NAME}" \
    --publish "127.0.0.1:${PORT}:5432" \
    "$IMAGE_TAG" >/dev/null

  # pg_isready over the unix socket goes true while initdb is still replaying the init scripts,
  # so poll over TCP instead: the entrypoint only listens on TCP once initialisation finished.
  printf 'test-db: waiting for initialisation' >&2
  local waited=0
  until docker exec "$CONTAINER_NAME" pg_isready --host 127.0.0.1 --username "$DB_USER" --dbname "$DB_NAME" >/dev/null 2>&1; do
    if ! container_running; then
      printf '\n' >&2
      docker logs --tail 40 "$CONTAINER_NAME" >&2 || true
      die "the container exited during initialisation (logs above)."
    fi
    if [ "$waited" -ge 120 ]; then
      printf '\n' >&2
      docker logs --tail 40 "$CONTAINER_NAME" >&2 || true
      die "timed out after ${waited}s waiting for initialisation (logs above)."
    fi
    printf '.' >&2
    sleep 1
    waited=$((waited + 1))
  done
  printf ' ready in %ss\n' "$waited" >&2
  stamp_marker
  url
}

cmd_down() {
  require_docker
  if ! container_exists; then
    printf 'test-db: nothing to remove\n' >&2
    return 0
  fi
  assert_owned
  # -v removes this run's anonymous PGDATA volume too. The dev stack's named postgres-data
  # volume is a different object and is never touched.
  docker rm -v -f "$CONTAINER_NAME" >/dev/null
  printf 'test-db: removed container %s and its data volume\n' "$CONTAINER_NAME" >&2
}

cmd_status() {
  require_docker
  if container_running; then
    printf 'running\t%s\t%s\n' "$CONTAINER_NAME" "$(url)"
  elif container_exists; then
    printf 'stopped\t%s\n' "$CONTAINER_NAME"
  else
    printf 'absent\t%s\n' "$CONTAINER_NAME"
  fi
}

cmd_psql() {
  require_docker
  container_running || die "container '${CONTAINER_NAME}' is not running. Run: $0 up"
  docker exec --interactive "$CONTAINER_NAME" psql --username "$DB_USER" --dbname "$DB_NAME" "$@"
}

usage() {
  cat <<USAGE
Usage: ${0##*/} <command>

  up       Build and start the disposable database, then print its connection URL.
           Replays every initialisation asset, so the database is always fresh.
  down     Remove this script's container and its data volume.
  url      Print the connection URL without starting anything.
  status   Report running | stopped | absent.
  psql     Open psql inside the container (extra arguments are passed through).

Environment:
  SPM_TEST_DB_PORT        host port to publish on (default 55432)
  SPM_TEST_DB_CONTAINER   container name (default spm-disposable-test-db)
  SPM_TEST_DB_IMAGE       image tag to build (default spm-disposable-test-db:local)

Typical use:
  export TEST_DATABASE_URL="\$(${0##*/} up)"
  cd backend && npm run test:e2e
  ${0##*/} down
USAGE
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  url) url ;;
  status) cmd_status ;;
  psql) shift; cmd_psql "$@" ;;
  -h|--help|help|"") usage ;;
  *) usage >&2; die "unknown command '${1}'" ;;
esac
