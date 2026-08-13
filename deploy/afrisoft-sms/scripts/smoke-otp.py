#!/usr/bin/env python3
"""Local smoke test for AfriSoft SMS hub MOCK OTP (server-side only)."""
import hmac
import hashlib
import json
import re
import time
import urllib.request

ENV = open("/opt/afrisoft-sms/.env", encoding="utf-8").read()
m = re.search(r"educongo:([^\s,]+)", ENV)
if not m:
    raise SystemExit("educongo api key not found in .env")
key = m.group(1)
base = "http://127.0.0.1:3001"


def call(path: str, body: dict):
    raw = json.dumps(body, separators=(",", ":"))
    ts = str(int(time.time()))
    sig = hmac.new(
        key.encode(),
        f"{ts}.POST.{path}.{raw}".encode(),
        hashlib.sha256,
    ).hexdigest()
    req = urllib.request.Request(
        base + path,
        data=raw.encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-AfriSoft-App-Id": "educongo",
            "X-AfriSoft-Api-Key": key,
            "X-AfriSoft-Timestamp": ts,
            "X-AfriSoft-Signature": sig,
        },
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode())


send = call(
    "/v1/otp/send",
    {
        "app_id": "educongo",
        "phone": "243970000001",
        "purpose": "login",
        "locale": "fr",
        "reference": "educongo_login_550e8400-e29b-41d4-a716-446655440000",
        "idempotency_key": "educongo:login:243970000001:smoke1",
    },
)
print("SEND", json.dumps(send))
code = send.get("debug_code") or "123456"
verify = call(
    "/v1/otp/verify",
    {
        "app_id": "educongo",
        "phone": "243970000001",
        "code": code,
        "reference": "educongo_login_550e8400-e29b-41d4-a716-446655440000",
    },
)
print("VERIFY", json.dumps(verify))
assert verify.get("verified") is True, verify
print("OK")
