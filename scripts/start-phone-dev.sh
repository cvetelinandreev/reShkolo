#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/ensure-project-node.sh"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not reachable. Start Docker Desktop and retry."
  exit 1
fi

docker compose up -d

if ! grep -q "^DATABASE_URL=" ".env.server" 2>/dev/null; then
  echo "Missing DATABASE_URL in .env.server"
  exit 1
fi

echo "Starting Wasp dev server with Node $(node -v)..."
exec wasp start
