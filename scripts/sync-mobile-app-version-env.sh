#!/usr/bin/env bash
# After a successful Play upload, lock the in-app update banner source of truth.
#
# Order matters (banners must not stay stuck if git push fails):
# 1) Write services/ride-service/src/public/mobile-store-version.json
# 2) Mirror MOBILE_* on Render + redeploy ride (instant API bump)
# 3) Commit + push the store file onto origin/main (and afri-soft when token set)
#
# Usage:
#   VERSION_NAME=1.0.34 VERSION_CODE=176 ./scripts/sync-mobile-app-version-env.sh
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

mirror_render() {
  if [[ -z "${RENDER_API_KEY:-}" ]]; then
    echo "::notice::RENDER_API_KEY unset — store file updated; Render mirror skipped"
    return 0
  fi

  local RIDE_ID
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
      echo "::warning::Failed to mirror $key (HTTP $http) — will still try git commit of store file"
      cat /tmp/mova-mobile-env.json || true
      return 0
    fi
    echo "Mirrored $key=$value on Render"
  }

  put_env MOBILE_PASSENGER_VERSION "$NAME"
  put_env MOBILE_DRIVER_VERSION "$NAME"
  put_env MOBILE_PASSENGER_VERSION_CODE "$CODE"
  put_env MOBILE_DRIVER_VERSION_CODE "$CODE"

  local DEPLOY_CODE
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
}

# Render first: banners must move even if git push is rejected later.
mirror_render

# Commit the baked source of truth so future deploys cannot roll banners back.
if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Local run: store file written; skip CI git push"
  exit 0
fi

cd "$ROOT"
git config user.name "senga-mobile-release"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# Detached HEAD (workflow_run SHA) cannot push to main — sync onto origin/main.
git fetch origin main
git checkout -B mobile-store-version-sync origin/main
# Re-apply the store file on top of latest main (checkout may have reset the working tree).
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
    print(f"Keep store file at {prev.get('version')}+{prev_code}")
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
print(f"Re-applied {path} → {name}+{code} on origin/main")
PY

git add -- "services/ride-service/src/public/mobile-store-version.json"
if git diff --cached --quiet; then
  echo "Store version file already at $NAME+$CODE on main"
else
  git commit -m "chore: advertise mobile store $NAME+$CODE for in-app update banners"
  push_ok=0
  for attempt in 1 2 3; do
    if git push origin HEAD:main; then
      push_ok=1
      break
    fi
    echo "::warning::git push origin main failed (attempt $attempt) — rebase and retry"
    git fetch origin main
    git rebase origin/main || git rebase --abort || true
    # Re-apply file after rebase in case conflict wiped it
    python - "$STORE_FILE" "$NAME" "$CODE" "$NOW" <<'PY'
import json, sys
path, name, code, now = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
payload = {
    "version": name,
    "versionCode": code,
    "updatedAt": now,
    "note": "Source of truth for GET /api/public/app-version. Updated automatically by mobile-release after a successful Play upload. Do not lower these values by hand.",
}
with open(path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
PY
    git add -- "services/ride-service/src/public/mobile-store-version.json"
    git diff --cached --quiet || git commit -m "chore: advertise mobile store $NAME+$CODE for in-app update banners" || true
    sleep 2
  done
  if [[ "$push_ok" -ne 1 ]]; then
    echo "::error::Failed to push store version to origin/main after retries — Render mirror already applied $NAME+$CODE"
    exit 1
  fi
  echo "Committed mobile-store-version.json ($NAME+$CODE) to origin/main"

  if [[ -n "${AFRI_SOFT_PUSH_TOKEN:-}" ]]; then
    git remote remove afri-soft 2>/dev/null || true
    git remote add afri-soft "https://x-access-token:${AFRI_SOFT_PUSH_TOKEN}@github.com/afri-soft-com/mova.git"
    if git push afri-soft HEAD:main; then
      echo "Pushed store version to afri-soft-com/mova"
    else
      echo "::warning::afri-soft push failed — origin/main + Render already have $NAME+$CODE"
    fi
  else
    echo "::notice::AFRI_SOFT_PUSH_TOKEN unset — origin updated; Render mirrored above"
  fi
fi
