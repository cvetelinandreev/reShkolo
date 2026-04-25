#!/usr/bin/env bash
# Run any command with the repo's Node version (from .node-version).
# Example: bash scripts/with-project-node.sh wasp version
set -euo pipefail

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${_script_dir}/ensure-project-node.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/with-project-node.sh <command> [args...]" >&2
  exit 2
fi

exec "$@"
