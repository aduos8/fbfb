#!/usr/bin/env sh
set -eu

MAX_RETRIES="${BOOTSTRAP_MAX_RETRIES:-8}"
RETRY_DELAY="${BOOTSTRAP_RETRY_DELAY:-5}"

run_with_retry() {
  step_name="$1"
  shift

  attempt=1
  while true; do
    if "$@"; then
      return 0
    fi

    if [ "$attempt" -ge "$MAX_RETRIES" ]; then
      echo "[entrypoint] ${step_name} failed after ${attempt} attempt(s)"
      return 1
    fi

    echo "[entrypoint] ${step_name} failed on attempt ${attempt}/${MAX_RETRIES}; retrying in ${RETRY_DELAY}s..."
    attempt=$((attempt + 1))
    sleep "$RETRY_DELAY"
  done
}

echo "[entrypoint] starting container bootstrap"
echo "[entrypoint] retries configured: max=${MAX_RETRIES}, delay=${RETRY_DELAY}s"

if [ "${RUN_DB_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] running postgres migrations"
  run_with_retry "postgres migrations" bun run db:migrate
fi

if [ "${RUN_CASSANDRA_INIT:-true}" = "true" ]; then
  echo "[entrypoint] initializing cassandra schema"
  run_with_retry "cassandra schema init" bun run cassandra:init
fi

if [ "${RUN_SEARCH_REINDEX_ON_BOOT:-false}" = "true" ]; then
  echo "[entrypoint] rebuilding meilisearch indexes"
  run_with_retry "meilisearch reindex" bun run search:reindex
fi

echo "[entrypoint] starting application"
exec bun run start