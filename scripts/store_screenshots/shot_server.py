#!/usr/bin/env python3
"""Tiny HTTP server for the store-screenshots workflow (macOS runner only).

The integration test running in the iOS simulator calls
  GET http://127.0.0.1:8765/shot?name=01-en-ligne
and this server saves a real simulator screenshot (status bar included) with
`xcrun simctl io <udid> screenshot`. Usage: shot_server.py <udid> <out_dir>
"""
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

UDID = sys.argv[1]
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        url = urlparse(self.path)
        if url.path != "/shot":
            self.send_response(404)
            self.end_headers()
            return
        name = parse_qs(url.query).get("name", ["shot"])[0]
        name = re.sub(r"[^a-zA-Z0-9._-]", "", name) or "shot"
        target = OUT / f"{name}.png"
        result = subprocess.run(
            ["xcrun", "simctl", "io", UDID, "screenshot", "--type=png", str(target)],
            capture_output=True,
            text=True,
        )
        ok = result.returncode == 0
        print(f"shot {name}: {'ok' if ok else result.stderr.strip()}", flush=True)
        self.send_response(200 if ok else 500)
        self.end_headers()
        self.wfile.write(b"ok" if ok else result.stderr.encode())

    def log_message(self, *_):
        pass


HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
