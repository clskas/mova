#!/usr/bin/env python3
"""Enable Sign in with Apple (APPLE_ID_AUTH) on Senga iOS App IDs via ASC API.

Match can only mint profiles that include com.apple.developer.applesignin after
the capability exists on the bundle ID. Requires APP_STORE_CONNECT_* secrets.
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
    import jwt
except ImportError:
    print("PyJWT required: pip install PyJWT cryptography", file=sys.stderr)
    sys.exit(1)

BASE = "https://api.appstoreconnect.apple.com"
BUNDLE_IDS = ("cd.mova.mova", "cd.mova.mova.driver")
# App Store Connect API capability type for Sign in with Apple
CAPABILITY = "APPLE_ID_AUTH"


def load_private_key() -> str:
    raw = os.environ.get("APP_STORE_CONNECT_API_KEY", "").strip()
    if not raw:
        raise SystemExit("APP_STORE_CONNECT_API_KEY missing")
    if "BEGIN PRIVATE KEY" in raw:
        return raw
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


def find_bundle_id_resource(token: str, identifier: str) -> str:
    q = urllib.parse.urlencode({"filter[identifier]": identifier, "limit": 10})
    data = api("GET", f"/v1/bundleIds?{q}", token)
    for row in data.get("data") or []:
        if (row.get("attributes") or {}).get("identifier") == identifier:
            return row["id"]
    raise RuntimeError(f"bundleId not found for {identifier}")


def list_capabilities(token: str, bundle_res_id: str) -> list[dict]:
    data = api("GET", f"/v1/bundleIds/{bundle_res_id}/bundleIdCapabilities", token)
    return list(data.get("data") or [])


def enable_apple_sign_in(token: str, bundle_res_id: str, identifier: str) -> str:
    existing = list_capabilities(token, bundle_res_id)
    for cap in existing:
        attrs = cap.get("attributes") or {}
        if attrs.get("capabilityType") == CAPABILITY:
            print(f"OK already enabled: {identifier} ({cap.get('id')})")
            return "already"
    body = {
        "data": {
            "type": "bundleIdCapabilities",
            "attributes": {
                "capabilityType": CAPABILITY,
                "settings": [],
            },
            "relationships": {
                "bundleId": {
                    "data": {"type": "bundleIds", "id": bundle_res_id},
                },
            },
        }
    }
    created = api("POST", "/v1/bundleIdCapabilities", token, body)
    cap_id = (created.get("data") or {}).get("id")
    print(f"ENABLED Sign in with Apple: {identifier} ({cap_id})")
    return "enabled"


def main() -> int:
    token = make_token()
    for identifier in BUNDLE_IDS:
        res_id = find_bundle_id_resource(token, identifier)
        enable_apple_sign_in(token, res_id, identifier)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise SystemExit(1)
