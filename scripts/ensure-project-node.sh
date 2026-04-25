#!/usr/bin/env bash
# Pin Node to the version in `.node-version` (same logic as start-phone-dev).
# Intended to be sourced from other scripts in this directory.
set -euo pipefail

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_project_root="$(cd "${_script_dir}/.." && pwd)"
cd "${_project_root}"

REQUIRED_NODE_VERSION="$(tr -d '[:space:]' < .node-version 2>/dev/null || true)"
if [[ -z "${REQUIRED_NODE_VERSION}" ]]; then
  REQUIRED_NODE_VERSION="22.22.2"
fi

use_node_from_nvm_dir() {
  local node_bin="${HOME}/.nvm/versions/node/v${REQUIRED_NODE_VERSION}/bin"
  if [[ -x "${node_bin}/node" ]]; then
    export PATH="${node_bin}:$PATH"
    return 0
  fi
  return 1
}

if ! use_node_from_nvm_dir; then
  if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    source "${HOME}/.nvm/nvm.sh"
    nvm use "${REQUIRED_NODE_VERSION}" >/dev/null
  fi
fi

CURRENT_NODE="$(node -v 2>/dev/null || true)"
if [[ "${CURRENT_NODE}" != "v${REQUIRED_NODE_VERSION}" ]]; then
  echo "Expected Node v${REQUIRED_NODE_VERSION}, but got ${CURRENT_NODE:-<missing>}." >&2
  echo "Install it with: nvm install ${REQUIRED_NODE_VERSION}" >&2
  exit 1
fi
