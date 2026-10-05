#!/usr/bin/env python3
"""Update App Store Connect review demo credentials/notes and submit for review.

Env (required):
  APP_STORE_CONNECT_KEY_ID
  APP_STORE_CONNECT_ISSUER_ID
  APP_STORE_CONNECT_API_KEY   # base64-encoded .p8 PEM, or raw PEM

Optional:
  ASC_APPS=passenger,driver   # default both
  ASC_SUBMIT=true|false       # default true
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    import jwt  # PyJWT
except ImportError:
    print("PyJWT required: pip install PyJWT cryptography", file=sys.stderr)
    sys.exit(1)

APPS = {
    "passenger": {
        "bundle_id": "cd.mova.mova",
        "demo_user": "+243900000010",
        "demo_password": "123456",
        "notes": """DEMO ACCESS (Guideline 2.1) — Senga passenger

1. Enter phone +243900000010 → Continue
2. Enter SMS OTP: 123456
3. Home → request a ride (destination in DRC / Kinshasa)
4. Account deletion: Aide → Contacter le support
Privacy: https://senga.afri-soft.com/privacy

Walkthrough: senga-passenger-app-review-walkthrough.mp4
Production API: https://api.afri-soft.com — demo OTP 123456 enabled for App Review.
""",
    },
    "driver": {
        "bundle_id": "cd.mova.mova.driver",
        "demo_user": "+243900000023",
        "demo_password": "123456",
        "notes": """DEMO ACCESS (Guideline 2.1) — Senga Driver

1. Enter phone +243900000023 → Continue
2. On the PIN screen, tap "Code PIN oublié ?" (Forgot PIN). Do NOT enter 123456 as the local PIN.
3. Enter SMS OTP: 123456
4. Toggle Online to receive jobs (KYC-approved demo driver).
5. Account deletion: Aide → Contacter le support
Privacy: https://senga.afri-soft.com/privacy

Walkthrough: senga-driver-app-review-walkthrough.mp4
Production API: https://api.afri-soft.com — demo OTP 123456 enabled for App Review.
""",
    },
}

BASE = "https://api.appstoreconnect.apple.com"


def load_private_key() -> str:
    raw = os.environ.get("APP_STORE_CONNECT_API_KEY", "").strip()
    if not raw:
        raise SystemExit("APP_STORE_CONNECT_API_KEY missing")
    if "BEGIN PRIVATE KEY" in raw:
        return raw
    # GitHub secret is base64 of the .p8 contents
    try:
        decoded = base64.b64decode(raw).decode("utf-8")
        if "BEGIN PRIVATE KEY" in decoded:
            return decoded
    except Exception:
        pass
    raise SystemExit("APP_STORE_CONNECT_API_KEY is not a PEM or base64 PEM")


def make_token() -> str:
    key_id = os.environ["APP_STORE_CONNECT_KEY_ID"].strip()
    issuer = os.environ["APP_STORE_CONNECT_ISSUER_ID"].strip()
    now = int(time.time())
    return jwt.encode(
        {"iss": issuer, "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
        load_private_key(),
        algorithm="ES256",
        headers={"alg": "ES256", "kid": key_id, "typ": "JWT"},
    )


def api(method: str, path: str, token: str, body: dict | None = None) -> dict:
    url = path if path.startswith("http") else f"{BASE}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} → {e.code}: {err}") from e


def find_app_id(token: str, bundle_id: str) -> str:
    q = urllib.parse.urlencode({"filter[bundleId]": bundle_id, "limit": 5})
    data = api("GET", f"/v1/apps?{q}", token)
    rows = data.get("data") or []
    for row in rows:
        bid = (row.get("attributes") or {}).get("bundleId")
        if bid == bundle_id:
            return row["id"]
    raise RuntimeError(f"App not found for bundle {bundle_id} (got {len(rows)} rows)")


PREFERRED_STATES = (
    "READY_FOR_REVIEW",
    "PREPARE_FOR_SUBMISSION",
    "REJECTED",
    "METADATA_REJECTED",
    "DEVELOPER_REJECTED",
    "INVALID_BINARY",
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "PENDING_DEVELOPER_RELEASE",
    "PENDING_APPLE_RELEASE",
)


def _version_rank(version: dict) -> tuple:
    attrs = version.get("attributes") or {}
    ver = str(attrs.get("versionString") or "0")
    parts: list[int] = []
    for p in ver.split("."):
        try:
            parts.append(int(p))
        except ValueError:
            parts.append(0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)


def find_version(token: str, app_id: str) -> dict:
    # Prefer editable / reviewable versions (no `sort` — ASC rejects it on this relationship).
    for state in PREFERRED_STATES:
        q = urllib.parse.urlencode({"filter[appStoreState]": state, "limit": 10})
        data = api("GET", f"/v1/apps/{app_id}/appStoreVersions?{q}", token)
        rows = data.get("data") or []
        if rows:
            return max(rows, key=_version_rank)
    q = urllib.parse.urlencode({"limit": 20})
    data = api("GET", f"/v1/apps/{app_id}/appStoreVersions?{q}", token)
    rows = data.get("data") or []
    if not rows:
        raise RuntimeError(f"No App Store versions for app {app_id}")
    return max(rows, key=_version_rank)


def get_or_create_review_detail(token: str, version_id: str) -> str:
    data = api("GET", f"/v1/appStoreVersions/{version_id}/appStoreReviewDetail", token)
    detail = data.get("data")
    if detail:
        return detail["id"]
    created = api(
        "POST",
        "/v1/appStoreReviewDetails",
        token,
        {
            "data": {
                "type": "appStoreReviewDetails",
                "relationships": {
                    "appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}}
                },
            }
        },
    )
    return created["data"]["id"]


def update_review_detail(token: str, detail_id: str, cfg: dict) -> None:
    api(
        "PATCH",
        f"/v1/appStoreReviewDetails/{detail_id}",
        token,
        {
            "data": {
                "type": "appStoreReviewDetails",
                "id": detail_id,
                "attributes": {
                    "demoAccountName": cfg["demo_user"],
                    "demoAccountPassword": cfg["demo_password"],
                    "demoAccountRequired": True,
                    "notes": cfg["notes"][:4000],
                },
            }
        },
    )


def find_open_review_submission(token: str, app_id: str) -> dict | None:
    q = urllib.parse.urlencode(
        {
            "filter[app]": app_id,
            "filter[state]": "READY_FOR_REVIEW,UNRESOLVED_ISSUES",
            "limit": 10,
        }
    )
    data = api("GET", f"/v1/reviewSubmissions?{q}", token)
    rows = data.get("data") or []
    return rows[0] if rows else None


def submit_version(token: str, app_id: str, version_id: str) -> None:
    """Modern Review Submissions API (appStoreVersionSubmissions CREATE is deprecated)."""
    submission = find_open_review_submission(token, app_id)
    if not submission:
        created = api(
            "POST",
            "/v1/reviewSubmissions",
            token,
            {
                "data": {
                    "type": "reviewSubmissions",
                    "attributes": {"platform": "IOS"},
                    "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
                }
            },
        )
        submission = created["data"]
    submission_id = submission["id"]
    sub_state = (submission.get("attributes") or {}).get("state")
    print(f"reviewSubmission id={submission_id} state={sub_state}")

    # UNRESOLVED_ISSUES already contains the rejected version — do not add items.
    if sub_state != "UNRESOLVED_ISSUES":
        items = api("GET", f"/v1/reviewSubmissions/{submission_id}/items", token)
        already = False
        for item in items.get("data") or []:
            rel = ((item.get("relationships") or {}).get("appStoreVersion") or {}).get("data") or {}
            if rel.get("id") == version_id:
                already = True
                break
        if not already:
            api(
                "POST",
                "/v1/reviewSubmissionItems",
                token,
                {
                    "data": {
                        "type": "reviewSubmissionItems",
                        "relationships": {
                            "reviewSubmission": {
                                "data": {"type": "reviewSubmissions", "id": submission_id}
                            },
                            "appStoreVersion": {
                                "data": {"type": "appStoreVersions", "id": version_id}
                            },
                        },
                    }
                },
            )
            print("attached appStoreVersion to reviewSubmission")
        else:
            print("appStoreVersion already on reviewSubmission")
    else:
        print("UNRESOLVED_ISSUES — resubmitting existing items after demo notes update")

    api(
        "PATCH",
        f"/v1/reviewSubmissions/{submission_id}",
        token,
        {
            "data": {
                "type": "reviewSubmissions",
                "id": submission_id,
                "attributes": {"submitted": True},
            }
        },
    )


def process_app(token: str, key: str, do_submit: bool) -> None:
    cfg = APPS[key]
    print(f"\n=== {key} ({cfg['bundle_id']}) ===")
    app_id = find_app_id(token, cfg["bundle_id"])
    version = find_version(token, app_id)
    attrs = version.get("attributes") or {}
    version_id = version["id"]
    state = attrs.get("appStoreState")
    ver = attrs.get("versionString")
    print(f"version={ver} state={state} id={version_id}")

    detail_id = get_or_create_review_detail(token, version_id)
    update_review_detail(token, detail_id, cfg)
    print(f"review detail updated (demo={cfg['demo_user']})")

    if not do_submit:
        print("ASC_SUBMIT=false — skip submit")
        return

    if state in ("WAITING_FOR_REVIEW", "IN_REVIEW"):
        print(f"already in review state={state} — skip submit")
        return

    if state not in (
        "PREPARE_FOR_SUBMISSION",
        "READY_FOR_REVIEW",
        "REJECTED",
        "METADATA_REJECTED",
        "DEVELOPER_REJECTED",
        "INVALID_BINARY",
    ):
        print(f"state={state} not submittable via API — update notes done; submit manually if needed")
        return

    try:
        submit_version(token, app_id, version_id)
        print("SUBMITTED for review")
    except RuntimeError as e:
        msg = str(e)
        print(f"SUBMIT FAILED: {msg[:1200]}")
        raise


def main() -> int:
    apps = [a.strip() for a in os.environ.get("ASC_APPS", "passenger,driver").split(",") if a.strip()]
    do_submit = os.environ.get("ASC_SUBMIT", "true").strip().lower() in ("1", "true", "yes")
    token = make_token()
    errors = []
    for key in apps:
        if key not in APPS:
            errors.append(f"unknown app key: {key}")
            continue
        try:
            process_app(token, key, do_submit)
        except Exception as e:
            print(f"ERROR {key}: {e}", file=sys.stderr)
            errors.append(f"{key}: {e}")
    if errors:
        print("\nCompleted with errors:", file=sys.stderr)
        for e in errors:
            print(f" - {e}", file=sys.stderr)
        return 1
    print("\nOK — review notes updated" + (" and submit attempted" if do_submit else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
