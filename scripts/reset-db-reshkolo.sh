#!/usr/bin/env bash
# Reset DB by re-running all Prisma migrations from scratch.
#
# Usage (from repo root):
#   bash scripts/reset-db-reshkolo.sh
#
# Requires: `.env.server` with DATABASE_URL, Docker Postgres up, Node from .nvmrc.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.server ]]; then
  echo "Missing .env.server (copy from .env.server.example)." >&2
  exit 1
fi

echo "Resetting database via Prisma migrations..."

bash scripts/with-project-node.sh npx dotenv -e .env.server -- prisma migrate reset --force --skip-seed --schema schema.prisma

echo "Done. Database was wiped and rebuilt from migrations."
