#!/usr/bin/env bash
# Offline tests for scripts/render-guard.sh: a fake `curl` serves canned Render API answers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard() { bash "$ROOT/scripts/render-guard.sh" "$@"; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"
cat > "$TMP/bin/curl" <<'FAKE'
#!/usr/bin/env bash
# Minimal curl: GET …/deploys → $FAKE_DEPLOYS ; POST → log + $FAKE_POST_CODE (rollbacks) / 201 (deploys).
out="" fmt="" method=GET url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    -w) fmt="$2"; shift ;;
    -X) method="$2"; shift ;;
    -H|-d) shift ;;
    -*) ;;
    *) url="$1" ;;
  esac
  shift
done
if [ "$method" = GET ]; then
  cat "$FAKE_DEPLOYS"
  exit 0
fi
echo "$method $url" >> "$FAKE_LOG"
code=201
case "$url" in */rollbacks) code="${FAKE_POST_CODE:-201}" ;; esac
[ -n "$out" ] && echo '{}' > "$out"
[ -n "$fmt" ] && printf '%s' "$code"
exit 0
FAKE
chmod +x "$TMP/bin/curl"

export PATH="$TMP/bin:$PATH"
export RENDER_API_KEY=test RENDER_GUARD_TIMEOUT_SEC=1 RENDER_GUARD_POLL_SEC=1 FAKE_LOG="$TMP/post.log"
SERVICES=$(jq '[.services | to_entries[] | select(.key | IN("mova-auth","mova-ride","mova-payment","mova-driver","mova-notification","mova-admin","mova-gateway","mova-web","mova-admin-web","mova-restaurant","mova-rental-partner")) | select(.value.id)] | length' "$ROOT/config/render-services.json")
pass=0
fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok - $*"; pass=$((pass + 1)); }

deploys() { echo "$1" > "$TMP/deploys.json"; export FAKE_DEPLOYS="$TMP/deploys.json"; }

deploys '[{"id":"dep-new","status":"live","commit":{"id":"NEW"},"createdAt":"2025-11-03T16:05:00.123Z"},
          {"id":"dep-old","status":"deactivated","commit":{"id":"OLD"},"createdAt":"2025-11-02T10:00:00Z"}]'
guard verify NEW >/dev/null && ok "verify: every service live on the new commit" || fail "verify live"

deploys '[{"id":"dep-new","status":"build_failed","commit":{"id":"NEW"},"createdAt":"2025-11-03T16:05:00Z"},
          {"id":"dep-old","status":"live","commit":{"id":"OLD"},"createdAt":"2025-11-02T10:00:00Z"}]'
if guard verify NEW >/dev/null 2>&1; then fail "verify must fail on build_failed"; fi
ok "verify: build_failed fails the deploy"

deploys '[{"id":"dep-same","status":"live","commit":{"id":"NEW"},"createdAt":"2025-11-01T10:00:00Z"}]'
guard verify NEW >/dev/null && ok "verify: commit already live (deploy skipped)" || fail "verify skipped"

deploys '[{"id":"dep-tip","status":"live","commit":{"id":"TIP"},"createdAt":"2025-11-03T16:06:00Z"},
          {"id":"dep-old","status":"deactivated","commit":{"id":"OLD"},"createdAt":"2025-11-02T10:00:00Z"}]'
if guard verify NEW >/dev/null 2>&1; then fail "another commit must not count as the new deploy"; fi
ok "verify: a live deploy of another commit does not count"

deploys '[{"id":"dep-new","status":"build_in_progress","commit":{"id":"NEW"},"createdAt":"2025-11-03T16:05:00Z"},
          {"id":"dep-old","status":"live","commit":{"id":"OLD"},"createdAt":"2025-11-02T10:00:00Z"}]'
if guard verify NEW >/dev/null 2>&1; then fail "verify must time out while building"; fi
ok "verify: still building at the deadline fails"

deploys '[{"id":"dep-old","status":"live","commit":{"id":"OLD"},"createdAt":"2025-11-02T10:00:00Z"}]'
guard snapshot "$TMP/snap.json" >/dev/null
[ "$(jq 'length' "$TMP/snap.json")" = "$SERVICES" ] || fail "snapshot size"
[ "$(jq -r '[.[]][0].deployId' "$TMP/snap.json")" = "dep-old" ] || fail "snapshot deployId"
ok "snapshot: live deploy recorded for $SERVICES services"

deploys '[{"id":"dep-new","status":"live","commit":{"id":"NEW"},"createdAt":"2025-11-03T16:05:00Z"},
          {"id":"dep-old","status":"deactivated","commit":{"id":"OLD"},"createdAt":"2025-11-02T10:00:00Z"}]'
: > "$FAKE_LOG"
FAKE_POST_CODE=201 guard rollback "$TMP/snap.json" >/dev/null 2>&1
[ "$(grep -c '/rollbacks$' "$FAKE_LOG")" = "$SERVICES" ] || fail "rollback API not called for every service"
ok "rollback: rollback API per changed service"

: > "$FAKE_LOG"
FAKE_POST_CODE=404 guard rollback "$TMP/snap.json" >/dev/null 2>&1
[ "$(grep -c '/deploys$' "$FAKE_LOG")" = "$SERVICES" ] || fail "commit redeploy fallback missing"
ok "rollback: falls back to redeploying the snapshot commit"

deploys '[{"id":"dep-old","status":"live","commit":{"id":"OLD"},"createdAt":"2025-11-02T10:00:00Z"}]'
: > "$FAKE_LOG"
guard rollback "$TMP/snap.json" >/dev/null 2>&1
[ ! -s "$FAKE_LOG" ] || fail "rollback must not touch services already on the snapshot"
ok "rollback: untouched services are left alone"

echo "render-guard: $pass tests passed"
