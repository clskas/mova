#!/usr/bin/env bash
# Définit les dart-defines production pour les builds Flutter.
# Usage : source mobile/scripts/set-prod-env.sh
# Surcharge : API_URL=https://... WS_URL=https://... source mobile/scripts/set-prod-env.sh

set -euo pipefail

API_URL="${API_URL:-https://mova-gateway.onrender.com/api}"
WS_URL="${WS_URL:-https://mova-gateway.onrender.com}"

export MOVA_DART_DEFINES="--dart-define=API_URL=${API_URL} --dart-define=WS_URL=${WS_URL}"

echo "MOVA production : API_URL=${API_URL} WS_URL=${WS_URL}"
