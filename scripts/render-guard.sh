#!/usr/bin/env bash
# Deploy guard for Render (used by .github/workflows/deploy.yml).
#
#   render-guard.sh snapshot <out.json>
#       Record the live deploy (id + commit) of every service before deploying.
#   render-guard.sh verify <commit-sha>
#       Wait until EVERY service runs the new deploy (not only the gateway).
#       Exit 1 when a service fails to build/start or times out.
#   render-guard.sh rollback <snapshot.json>
#       Put every service that changed back on its snapshot deploy:
#       Render rollback API first, then a redeploy of the snapshot commit.
#
# Env: RENDER_API_KEY (required), RENDER_GUARD_TIMEOUT_SEC (default 1800),
#      RENDER_GUARD_POLL_SEC (default 20).
set -euo pipefail

API="https://api.render.com/v1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMEOUT_SEC="${RENDER_GUARD_TIMEOUT_SEC:-1800}"
POLL_SEC="${RENDER_GUARD_POLL_SEC:-20}"

if [ -z "${RENDER_API_KEY:-}" ]; then
  echo "::warning::RENDER_API_KEY not set — deploy guard skipped"
  exit 0
fi

auth=(-H "Authorization: Bearer ${RENDER_API_KEY}" -H "Accept: application/json")

# "id name" lines, same service list as scripts/render-deploy.sh.
services() {
  jq -r '.services | to_entries[]
    | select(.key | IN("mova-auth","mova-ride","mova-payment","mova-driver","mova-notification",
                       "mova-admin","mova-gateway","mova-web","mova-admin-web","mova-restaurant",
                       "mova-rental-partner"))
    | select(.value.id != null and .value.id != "")
    | "\(.value.id) \(.key)"' "$ROOT/config/render-services.json"
}

deploys() {
  curl -sf "${auth[@]}" "$API/services/$1/deploys?limit=10" | jq '[.[] | (.deploy // .)]'
}

cmd_snapshot() {
  local out="$1" json='{}'
  while read -r id name; do
    local live
    live=$(deploys "$id" | jq -c '[.[] | select(.status == "live")][0] // empty')
    if [ -z "$live" ]; then
      echo "::warning::$name: no live deploy found — cannot roll it back"
      continue
    fi
    json=$(jq --arg id "$id" --arg name "$name" --argjson d "$live" \
      '. + {($id): {name: $name, deployId: $d.id, commit: ($d.commit.id // "")}}' <<<"$json")
    echo "$name: live $(jq -r '.id' <<<"$live") @ $(jq -r '.commit.id // "?"' <<<"$live" | cut -c1-8)"
  done < <(services)
  echo "$json" > "$out"
}

# live | failed | pending for one service: only a deploy of exactly <sha> counts.
service_state() {
  local id="$1" sha="$2"
  deploys "$id" | jq -r --arg sha "$sha" '
    [.[] | select(.commit.id == $sha)] as $mine
    | if ($mine | map(select(.status == "live")) | length) > 0 then "live"
      elif ($mine | length) > 0 and ($mine[0].status | IN("build_failed","update_failed","canceled")) then "failed"
      else "pending" end'
}

cmd_verify() {
  local sha="$1" deadline=$(( $(date +%s) + TIMEOUT_SEC ))
  declare -A done_=()
  local total
  total=$(services | wc -l)
  while :; do
    local failed=0
    while read -r id name; do
      [ -n "${done_[$id]:-}" ] && continue
      case "$(service_state "$id" "$sha" || echo pending)" in
        live) done_[$id]=1; echo "✓ $name live" ;;
        failed) echo "::error::$name deploy failed for $sha"; failed=1 ;;
      esac
    done < <(services)
    [ "$failed" = 1 ] && return 1
    [ "${#done_[@]}" -ge "$total" ] && { echo "All $total services live for $sha"; return 0; }
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "::error::Timeout: ${#done_[@]}/$total services live after ${TIMEOUT_SEC}s"
      return 1
    fi
    sleep "$POLL_SEC"
  done
}

cmd_rollback() {
  local snap="$1" rolled=0
  while read -r id name; do
    local target commit current
    target=$(jq -r --arg id "$id" '.[$id].deployId // empty' "$snap")
    commit=$(jq -r --arg id "$id" '.[$id].commit // empty' "$snap")
    [ -z "$target" ] && continue
    current=$(deploys "$id" | jq -r '[.[] | select(.status == "live")][0].id // empty')
    if [ "$current" = "$target" ]; then
      echo "$name: still on $target — nothing to roll back"
      continue
    fi
    echo "$name: rolling back to $target (${commit:0:8})"
    local code
    code=$(curl -s -o /tmp/render-rollback.json -w "%{http_code}" -X POST "${auth[@]}" \
      -H "Content-Type: application/json" "$API/services/$id/rollbacks" \
      -d "$(jq -n --arg d "$target" '{deployId: $d}')") || code=000
    if [[ "$code" != 2* ]] && [ -n "$commit" ]; then
      echo "  rollback API HTTP $code — redeploying commit ${commit:0:8}"
      code=$(curl -s -o /tmp/render-rollback.json -w "%{http_code}" -X POST "${auth[@]}" \
        -H "Content-Type: application/json" "$API/services/$id/deploys" \
        -d "$(jq -n --arg c "$commit" '{commitId: $c, clearCache: "do_not_clear"}')") || code=000
    fi
    if [[ "$code" == 2* ]]; then
      rolled=$((rolled + 1))
    else
      echo "::error::$name rollback failed (HTTP $code): $(cat /tmp/render-rollback.json 2>/dev/null)"
    fi
  done < <(services)
  echo "::warning::Rolled back $rolled service(s) to the pre-deploy version"
}

case "${1:-}" in
  snapshot) cmd_snapshot "${2:?out.json}" ;;
  verify) cmd_verify "${2:?commit sha}" ;;
  rollback) cmd_rollback "${2:?snapshot.json}" ;;
  *) echo "Usage: $0 snapshot|verify|rollback ..." >&2; exit 2 ;;
esac
