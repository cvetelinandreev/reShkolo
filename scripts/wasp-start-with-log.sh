#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs
echo "Logging to logs/wasp-dev.log — in another terminal: npm run tail:wasp"
echo "LLM request bodies: set LLM_DEBUG_LOG=true in .env.server (server picks it up on restart)."
npm run wasp -- start 2>&1 | tee logs/wasp-dev.log
