#!/usr/bin/env bash
set -euo pipefail

# Optional: download artifacts, set CUDA_VISIBLE_DEVICES, etc.
if [[ -n "${TRAINING_PRE_HOOK:-}" ]]; then
  # shellcheck disable=SC2086
  eval ${TRAINING_PRE_HOOK}
fi

exec "$@"
