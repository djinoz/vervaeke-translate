#!/bin/bash
set -euo pipefail

PROJECT_ID="vervaeke-translate"
SA_KEY_DEFAULT="$HOME/.hermes/secrets/${PROJECT_ID}-firebase-cli-hosting-sa.json"

if [ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ] && [ -f "$SA_KEY_DEFAULT" ]; then
  export GOOGLE_APPLICATION_CREDENTIALS="$SA_KEY_DEFAULT"
fi

if [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
  export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.cache/firebase-sa-config/$PROJECT_ID}"
  mkdir -p "$XDG_CONFIG_HOME"
fi

exec firebase "$@"
