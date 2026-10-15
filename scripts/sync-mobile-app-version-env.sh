#!/usr/bin/env bash
# After a successful Play upload, lock the in-app update banner source of truth.
#
# 1) Writes services/ride-service/src/public/mobile-store-version.json (baked into
#    the Docker image — survives every backend deploy / blueprint sync).
# 2) Commits + pushes that file on main when running in GitHub Actions.
# 3) Optionally mirrors MOBILE_* on Render for instant effect before the image rebuild.
#
# Usage:
#   VERSION_NAME=1.0.32 VERSION_CODE=158 ./scripts/sync-mobile-app-version-env.sh
set -euo pipefail

NAME="${VERSION_NAME:-${1:-}}"
CODE="${VERSION_CODE:-${2:-}}"
if [[ -z "$NAME" || -z "$CODE" ]]; then
  echo "Usage: VERSION_NAME=x.y.z VERSION_CODE=N $0" >&2
  exit 1
fi
if [[ ! "$CODE" =~ ^[0-9]+$ ]]; then
  echo "VERSION_CODE must be an integer, got: $CODE" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STORE_FILE="$ROOT/services/ride-service/src/public/mobile-store-version.json"
NOW="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"

python - "$STORE_FILE" "$NAME" "$CODE" "$NOW" <<'PY'
import json, sys
path, name, code, now = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
prev = {}
try:
    with open(path, encoding="utf-8") as f:
        prev = json.load(f)
except Exception:
    pass
prev_code = int(prev.get("versionCode") or 0)
if prev_code > code:
    print(f"Keep store file at {prev.get('version')}+{prev_code} (newer than {name}+{code})")
    sys.exit(0)
payload = {
    "version": name,
    "versionCode": code,
    "updatedAt": now,
    "note": "Source of truth for GET /api/public/app-version. Updated automatically by mobile-release after a successful Play upload. Do not lower these values by hand.",
}
with open(path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
print(f"Wrote {path} → {name}+{code}")
PY

# Commit the baked source of truth so future deploys cannot roll banners back.
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  cd "$ROOT"
  git config user.name "senga-mobile-release"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git add -- "services/ride-service/src/public/mobile-store-version.json"
  if git diff --cached --quiet; then
    echo "Store version file already at $NAME+$CODE"
  else
    git commit -m "chore: advertise mobile store $NAME+$CODE for in-app update banners"
    git push origin HEAD:main
    if [[ -n "${AFRI_SOFT_PUSH_TOKEN:-}" ]]; then
      git remote remove afri-soft 2>/dev/null || true
      git remote add afri-soft "https://x-access-token:${AFRI_SOFT_PUSH_TOKEN}@github.com/afri-soft-com/mova.git"
      git push afri-soft HEAD:main
      echo "Pushed store version to afri-soft-com/mova"
    else
      echo "::notice::AFRI_SOFT_PUSH_TOKEN unset — origin updated; Render still gets the raise via MOBILE_* mirror below"
    fi
    echo "Committed mobile-store-version.json ($NAME+$CODE)"
  fi
fi

# Mirror on Render for immediate banner update (env cannot lower the baked floor).
if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo "::notice::RENDER_API_KEY unset — store file updated; Render mirror skipped"
  exit 0
fi

RIDE_ID="$(python -c "import json; print(json.load(open(r'$ROOT/config/render-services.json'))['services']['mova-ride']['id'])")"

put_env() {
  local key="$1" value="$2"
  local url="https://api.render.com/v1/services/${RIDE_ID}/env-vars/$(python -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$key")"
  local http
  http=$(curl -sS -o /tmp/mova-mobile-env.json -w "%{http_code}" -X PUT "$url" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$(python -c "import json,sys; print(json.dumps({'value': sys.argv[1]}))" "$value")")
  if [[ "$http" == "404" ]]; then
    http=$(curl -sS -o /tmp/mova-mobile-env.json -w "%{http_code}" -X POST \
      "https://api.render.com/v1/services/${RIDE_ID}/env-vars" \
      -H "Authorization: Bearer ${RENDER_API_KEY}" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -d "$(python -c "import json,sys; print(json.dumps({'key': sys.argv[1], 'value': sys.argv[2]}))" "$key" "$value")")
  fi
  if [[ "$http" != "200" && "$http" != "201" ]]; then
    echo "::warning::Failed to mirror $key (HTTP $http) — baked store file still protects banners"
    cat /tmp/mova-mobile-env.json || true
    return 0
  fi
  echo "Mirrored $key=$value on Render"
}

put_env MOBILE_PASSENGER_VERSION "$NAME"
put_env MOBILE_DRIVER_VERSION "$NAME"
put_env MOBILE_PASSENGER_VERSION_CODE "$CODE"
put_env MOBILE_DRIVER_VERSION_CODE "$CODE"

DEPLOY_CODE=$(curl -sS -o /tmp/mova-ride-deploy.json -w "%{http_code}" -X POST \
  "https://api.render.com/v1/services/${RIDE_ID}/deploys" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{}')
if [[ "$DEPLOY_CODE" != "200" && "$DEPLOY_CODE" != "201" ]]; then
  echo "::notice::ride-service redeploy HTTP $DEPLOY_CODE (image rebuild from push will apply the store file)"
else
  echo "Triggered ride-service redeploy for $NAME+$CODE"
fi
