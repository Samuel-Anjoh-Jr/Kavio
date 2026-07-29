#!/usr/bin/env bash
# Dumps the local Postgres database (via the running docker compose container) into ./backups.
set -euo pipefail

cd "$(dirname "$0")/.."

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-kavio}"

mkdir -p backups

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
FILE="backups/kavio-${TIMESTAMP}.sql"

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$FILE"

echo "[backup:db] wrote $FILE"
