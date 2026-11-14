#!/usr/bin/env python3
"""Prints the App Store state of each SENGA app (read-only). Used by ios-review-watch.yml.

Never submits anything: the owner decides (rule: one app at a time, never replace a version
in review without asking)."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from asc_update_review_and_submit import api, find_app_id, make_token  # noqa: E402

APPS = {"passenger": "cd.mova.mova", "driver": "cd.mova.mova.driver"}


def main() -> None:
    token = make_token()
    out = {}
    for name, bundle in APPS.items():
        app_id = find_app_id(token, bundle)
        rows = api("GET", f"/v1/apps/{app_id}/appStoreVersions?limit=5&filter[platform]=IOS", token).get("data") or []
        out[name] = [
            {"version": (r.get("attributes") or {}).get("versionString"), "state": (r.get("attributes") or {}).get("appStoreState")}
            for r in rows
        ]
    print(json.dumps(out))


if __name__ == "__main__":
    main()
