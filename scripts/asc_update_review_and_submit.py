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


EDITABLE_STATES = (
    "PREPARE_FOR_SUBMISSION",
    "READY_FOR_REVIEW",
    "REJECTED",
    "METADATA_REJECTED",
    "DEVELOPER_REJECTED",
    "INVALID_BINARY",
)


def get_or_create_editable_version(token: str, app_id: str, version_string: str) -> dict:
    """Return an editable App Store version, creating `version_string` if needed."""
    for state in EDITABLE_STATES:
        q = urllib.parse.urlencode({"filter[appStoreState]": state, "limit": 20})
        data = api("GET", f"/v1/apps/{app_id}/appStoreVersions?{q}", token)
        for row in data.get("data") or []:
            ver = (row.get("attributes") or {}).get("versionString")
            if ver == version_string:
                return row
        rows = data.get("data") or []
        if rows:
            # Prefer any editable version (even if marketing string differs).
            return max(rows, key=_version_rank)

    # Create a new IOS version for submission.
    try:
        created = api(
            "POST",
            "/v1/appStoreVersions",
            token,
            {
                "data": {
                    "type": "appStoreVersions",
                    "attributes": {
                        "platform": "IOS",
                        "versionString": version_string,
                    },
                    "relationships": {
                        "app": {"data": {"type": "apps", "id": app_id}},
                    },
                }
            },
        )
        print(f"created appStoreVersion {version_string}")
        return created["data"]
    except RuntimeError as e:
        # Often: another version is already Waiting for Review / Pending Release.
        print(f"create version failed ({e}); falling back to existing version")
        return find_version(token, app_id)


DEFAULT_WHATS_NEW = (
    "Corrections de stabilité, messages d’erreur plus clairs en cas de "
    "connexion faible, et améliorations du suivi des courses et livraisons."
)


def ensure_whats_new(token: str, version_id: str, text: str | None = None) -> None:
    """App Store requires localization.whatsNew before review submit."""
    body_text = (text or os.environ.get("ASC_WHATS_NEW") or DEFAULT_WHATS_NEW).strip()
    if not body_text:
        return
    data = api("GET", f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations", token)
    for loc in data.get("data") or []:
        loc_id = loc["id"]
        attrs = loc.get("attributes") or {}
        locale = attrs.get("locale")
        current = (attrs.get("whatsNew") or "").strip()
        if current:
            print(f"whatsNew already set for {locale}")
            continue
        api(
            "PATCH",
            f"/v1/appStoreVersionLocalizations/{loc_id}",
            token,
            {
                "data": {
                    "type": "appStoreVersionLocalizations",
                    "id": loc_id,
                    "attributes": {"whatsNew": body_text[:4000]},
                }
            },
        )
        print(f"whatsNew set for {locale}")


def find_latest_processed_build(token: str, app_id: str, prefer_number: str | None = None) -> dict:
    q = urllib.parse.urlencode(
        {
            "filter[app]": app_id,
            "filter[processingState]": "VALID",
            "limit": 50,
        }
    )
    data = api("GET", f"/v1/builds?{q}", token)
    rows = data.get("data") or []
    if not rows:
        # Fallback without processingState filter.
        q2 = urllib.parse.urlencode({"filter[app]": app_id, "limit": 50})
        data = api("GET", f"/v1/builds?{q2}", token)
        rows = [
            r
            for r in (data.get("data") or [])
            if (r.get("attributes") or {}).get("processingState") in (None, "VALID", "VALIDATING")
        ]
    if not rows:
        raise RuntimeError(f"No processed builds for app {app_id}")

    def build_key(b: dict) -> tuple:
        attrs = b.get("attributes") or {}
        num = str(attrs.get("version") or "0")
        try:
            n = int(num)
        except ValueError:
            n = 0
        uploaded = str(attrs.get("uploadedDate") or "")
        prefer = 1 if prefer_number and num == prefer_number else 0
        return (prefer, n, uploaded)

    return max(rows, key=build_key)


def attach_build_to_version(token: str, version_id: str, build_id: str) -> None:
    api(
        "PATCH",
        f"/v1/appStoreVersions/{version_id}/relationships/build",
        token,
        {"data": {"type": "builds", "id": build_id}},
    )
    print(f"attached build {build_id} → version {version_id}")


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
    version_string = os.environ.get("ASC_VERSION", "1.0.18").strip() or "1.0.18"
    prefer_build = os.environ.get("ASC_BUILD_NUMBER", "").strip() or None

    version = get_or_create_editable_version(token, app_id, version_string)
    attrs = version.get("attributes") or {}
    version_id = version["id"]
    state = attrs.get("appStoreState")
    ver = attrs.get("versionString")
    print(f"version={ver} state={state} id={version_id}")

    # Attach newest processed TestFlight build (prefer CI build number when set).
    try:
        build = find_latest_processed_build(token, app_id, prefer_build)
        battrs = build.get("attributes") or {}
        print(
            f"build version={battrs.get('version')} "
            f"processing={battrs.get('processingState')} id={build['id']}"
        )
        if state in EDITABLE_STATES:
            attach_build_to_version(token, version_id, build["id"])
    except Exception as e:
        print(f"build attach skipped/failed: {e}")

    detail_id = get_or_create_review_detail(token, version_id)
    update_review_detail(token, detail_id, cfg)
    print(f"review detail updated (demo={cfg['demo_user']})")

    if not do_submit:
        print("ASC_SUBMIT=false — skip submit")
        return "notes_only"

    if state in ("WAITING_FOR_REVIEW", "IN_REVIEW"):
        print(f"already in review state={state} — skip submit")
        return "already_in_review"

    if state not in EDITABLE_STATES:
        print(f"state={state} not submittable via API — update notes done; submit manually if needed")
        return "notes_ok_submit_blocked"

    try:
        submit_version(token, app_id, version_id)
        print("SUBMITTED for review")
        return "submitted"
    except RuntimeError as e:
        msg = str(e)
        print(f"SUBMIT FAILED: {msg[:1200]}")
        # After Guideline rejection, ASC often requires a Resolution Center reply
        # (message + optional video) before API submit is accepted.
        if "not ready to be submitted" in msg or "UNRESOLVED_ISSUES" in msg or "ENTITY_STATE_INVALID" in msg:
            print(
                "NOTES_OK_SUBMIT_BLOCKED — open App Store Connect → App Review / "
                "Resolution Center → reply with the walkthrough MP4 → Submit for Review."
            )
            return "notes_ok_submit_blocked"
        raise


def main() -> int:
    apps = [a.strip() for a in os.environ.get("ASC_APPS", "passenger,driver").split(",") if a.strip()]
    do_submit = os.environ.get("ASC_SUBMIT", "true").strip().lower() in ("1", "true", "yes")
    # Retry briefly — CI often submits before Apple finishes processing the IPA.
    attempts = int(os.environ.get("ASC_SUBMIT_ATTEMPTS", "6") or "6")
    delay_s = int(os.environ.get("ASC_SUBMIT_RETRY_SECONDS", "45") or "45")
    token = make_token()
    errors = []
    results: list[str] = []
    for key in apps:
        if key not in APPS:
            errors.append(f"unknown app key: {key}")
            continue
        last_err: Exception | None = None
        outcome = None
        for attempt in range(1, attempts + 1):
            try:
                outcome = process_app(token, key, do_submit)
                last_err = None
                break
            except Exception as e:
                last_err = e
                print(f"attempt {attempt}/{attempts} {key}: {e}", file=sys.stderr)
                if attempt < attempts:
                    time.sleep(delay_s)
                    token = make_token()
        if last_err is not None:
            print(f"ERROR {key}: {last_err}", file=sys.stderr)
            errors.append(f"{key}: {last_err}")
        elif outcome:
            results.append(f"{key}:{outcome}")
    if errors:
        print("\nCompleted with errors:", file=sys.stderr)
        for e in errors:
            print(f" - {e}", file=sys.stderr)
        return 1
    print("\nOK — review notes updated" + (" and submit attempted" if do_submit else ""))
    for r in results:
        print(f"  {r}")
    if any("notes_ok_submit_blocked" in r for r in results):
        print(
            "\nManual step required in ASC Resolution Center (attach MP4 from "
            "mobile/store-listing/ios/*.mp4 then Submit)."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
