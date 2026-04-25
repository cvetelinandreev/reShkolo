#!/usr/bin/env bash
# Trigger full summary regeneration for every space (all prompt×model cards;
# each card updates English + Bulgarian text). The server first copies
# AppSetting `default_summary_system_prompt` onto every space’s `default`
# experiment prompt, then regenerates. Requires a running Wasp server.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_ROOT}"

if [[ ! -f .env.server ]]; then
  echo "Missing .env.server (copy from .env.server.example)." >&2
  exit 1
fi

npx dotenv -e .env.server -- bash <<'INNER'
set -euo pipefail
if [[ -z "${REGENERATE_ALL_SUMMARIES_SECRET:-}" ]]; then
  echo "Set REGENERATE_ALL_SUMMARIES_SECRET in .env.server (non-empty), restart wasp start, then re-run this script." >&2
  exit 1
fi

BASE="${WASP_SERVER_URL:-http://localhost:3001}"
URL="${BASE%/}/admin/regenerate-all-summaries"

echo "POST ${URL}"
resp="$(curl -sS -w "\n%{http_code}" -X POST "${URL}" \
  -H "x-reshkolo-regenerate-secret: ${REGENERATE_ALL_SUMMARIES_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{}')"

body="$(echo "${resp}" | sed '$d')"
code="$(echo "${resp}" | tail -n1)"
echo "${body}"
if [[ "${code}" != "200" ]]; then
  echo "HTTP ${code}" >&2
  exit 1
fi
INNER
