#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/logs/wasp-dev.log"
mkdir -p "$(dirname "$LOG")"
touch "$LOG"
if [ ! -s "$LOG" ]; then
  echo >&2 "Note: this file stays empty unless the dev server is started with: npm run wasp:log"
  echo >&2 "      (that pipes wasp output through tee). For full LLM prompts in logs, set LLM_DEBUG_LOG=true in .env.server."
fi
exec tail -f "$LOG"
