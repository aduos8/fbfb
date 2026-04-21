#!/usr/bin/env sh
set -eu

echo "[entrypoint] starting container bootstrap"

if [ "${RUN_DB_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] running postgres migrations"
  bun run db:migrate
fi

if [ "${RUN_CASSANDRA_INIT:-true}" = "true" ]; then
  echo "[entrypoint] initializing cassandra schema"
  bun run cassandra:init
fi

if [ "${RUN_SEARCH_REINDEX_ON_BOOT:-false}" = "true" ]; then
  echo "[entrypoint] rebuilding meilisearch indexes"
  bun run search:reindex
fi

echo "[entrypoint] starting application"
exec bun run start
