#!/usr/bin/env python3
"""
Local static server with APIs for content + Google Drive media proxy.

  python3 server.py
  → http://127.0.0.1:8080/
  → http://127.0.0.1:8080/admin/

POST/PUT /api/content     → writes data/questions.json
GET      /api/content     → returns data/questions.json
GET      /api/drive/<id>  → streams a public Google Drive file (audio/images)
POST     /api/visit       → register unique device visit
GET      /api/visitors    → unique visitor stats
"""

from __future__ import annotations

import json
import os
import re
import sys
import threading
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookiejar import CookieJar
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "questions.json"
VISITORS_FILE = ROOT / "data" / "visitors.json"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
DRIVE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{10,}$")
DEVICE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{8,80}$")
_visitors_lock = threading.Lock()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_visitors() -> dict:
    if VISITORS_FILE.is_file():
        try:
            data = json.loads(VISITORS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                devices = data.get("devices")
                if not isinstance(devices, dict):
                    devices = {}
                return {
                    "count": int(data.get("count") or len(devices)),
                    "updatedAt": data.get("updatedAt"),
                    "devices": devices,
                }
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            pass
    return {"count": 0, "updatedAt": None, "devices": {}}


def save_visitors(data: dict) -> None:
    VISITORS_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "count": int(data.get("count") or 0),
        "updatedAt": data.get("updatedAt"),
        "devices": data.get("devices") or {},
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    tmp = VISITORS_FILE.with_suffix(".json.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(VISITORS_FILE)


def fetch_google_drive_file(file_id: str) -> tuple[bytes, str]:
    """Download a publicly shared Drive file, handling the virus-scan interstitial."""
    jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))

    def open_url(url: str):
        req = Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
        return opener.open(req, timeout=90)

    url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm=t"
    try:
        with open_url(url) as resp:
            data = resp.read()
            ctype = resp.headers.get("Content-Type", "application/octet-stream")
    except HTTPError as exc:
        raise RuntimeError(f"Drive HTTP {exc.code}") from exc
    except URLError as exc:
        raise RuntimeError(f"Drive network error: {exc.reason}") from exc

    looks_html = (
        "text/html" in (ctype or "").lower()
        or data.lstrip()[:15].lower().startswith(b"<!doctype")
        or data.lstrip()[:6].lower().startswith(b"<html")
    )

    if looks_html:
        html = data.decode("utf-8", errors="ignore")
        token = None
        m = re.search(r'name="confirm"\s+value="([^"]+)"', html)
        if m:
            token = m.group(1)
        if not token:
            m = re.search(r"confirm=([0-9A-Za-z_-]+)", html)
            if m:
                token = m.group(1)
        if not token:
            token = "t"

        url2 = f"https://drive.google.com/uc?export=download&id={file_id}&confirm={token}"
        try:
            with open_url(url2) as resp2:
                data = resp2.read()
                ctype = resp2.headers.get("Content-Type", "application/octet-stream")
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Drive confirm download failed: {exc}") from exc

        if (
            "text/html" in (ctype or "").lower()
            or data.lstrip()[:15].lower().startswith(b"<!doctype")
            or data.lstrip()[:6].lower().startswith(b"<html")
        ):
            raise RuntimeError(
                "Drive returned HTML instead of media. "
                "Make sure the file is shared as 'Anyone with the link'."
            )

    if not ctype or "octet-stream" in ctype or "text/html" in ctype:
        # Guess from magic bytes
        if data[:3] == b"ID3" or data[:2] == b"\xff\xfb" or data[:2] == b"\xff\xf3":
            ctype = "audio/mpeg"
        elif data[:4] == b"fLaC":
            ctype = "audio/flac"
        elif data[:4] == b"OggS":
            ctype = "audio/ogg"
        elif data[:4] == b"RIFF":
            ctype = "audio/wav"
        elif data[:4] == b"\x89PNG":
            ctype = "image/png"
        elif data[:2] == b"\xff\xd8":
            ctype = "image/jpeg"
        else:
            ctype = "audio/mpeg"

    return data, ctype


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.send_header("Cache-Control", "no-store")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/api/content":
            self._send_content_file()
            return

        if path == "/api/visitors":
            self._send_visitors()
            return

        if path.startswith("/api/drive/"):
            file_id = unquote(path[len("/api/drive/") :])
            # allow ?id= fallback
            if not file_id:
                qs = parse_qs(parsed.query)
                file_id = (qs.get("id") or [""])[0]
            self._proxy_drive(file_id)
            return

        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path == "/api/visit":
            self._handle_visit()
            return
        self._handle_save()

    def do_PUT(self) -> None:  # noqa: N802
        self._handle_save()

    def _json_response(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _send_visitors(self) -> None:
        with _visitors_lock:
            data = load_visitors()
        self._json_response(
            HTTPStatus.OK,
            {
                "ok": True,
                "count": int(data.get("count") or 0),
                "updatedAt": data.get("updatedAt"),
                "source": "api",
            },
        )

    def _handle_visit(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > 4096:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid body")
            return

        try:
            body = self.rfile.read(length)
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON")
            return

        device_id = str((payload or {}).get("deviceId") or "").strip()
        if not DEVICE_ID_RE.match(device_id):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid deviceId")
            return

        client_ip = (self.client_address[0] if self.client_address else "") or ""
        now = utc_now_iso()

        with _visitors_lock:
            data = load_visitors()
            devices = data.setdefault("devices", {})
            existing = devices.get(device_id)
            is_new = existing is None
            if is_new:
                devices[device_id] = {
                    "firstSeen": now,
                    "lastSeen": now,
                    "visits": 1,
                    "ip": client_ip,
                }
                data["count"] = len(devices)
                data["updatedAt"] = now
            else:
                existing["lastSeen"] = now
                existing["visits"] = int(existing.get("visits") or 1) + 1
                if client_ip:
                    existing["ip"] = client_ip
                data["updatedAt"] = now
            # Keep count aligned with unique devices
            data["count"] = len(devices)
            save_visitors(data)

        print(
            f"[visit] {'new' if is_new else 'known'} device={device_id[:12]}… "
            f"count={data['count']} ip={client_ip}",
            flush=True,
        )
        self._json_response(
            HTTPStatus.OK,
            {
                "ok": True,
                "isNew": is_new,
                "count": int(data["count"]),
                "source": "api",
            },
        )

    def _send_content_file(self) -> None:
        if not DATA_FILE.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "questions.json not found")
            return
        raw = DATA_FILE.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self._cors()
        self.end_headers()
        self.wfile.write(raw)

    def _proxy_drive(self, file_id: str) -> None:
        file_id = (file_id or "").strip()
        if not DRIVE_ID_RE.match(file_id):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid Google Drive file id")
            return

        try:
            data, ctype = fetch_google_drive_file(file_id)
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            print(f"[drive] fail {file_id}: {msg}", flush=True)
            body = json.dumps({"ok": False, "error": msg}).encode("utf-8")
            self.send_response(HTTPStatus.BAD_GATEWAY)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
            return

        print(f"[drive] ok {file_id} ({len(data)} bytes, {ctype})", flush=True)
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Accept-Ranges", "none")
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _handle_save(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/api/content":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            self.send_error(HTTPStatus.BAD_REQUEST, "Empty body")
            return
        if length > 25 * 1024 * 1024:
            self.send_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Payload too large")
            return

        try:
            body = self.rfile.read(length)
            data = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            self.send_error(HTTPStatus.BAD_REQUEST, f"Invalid JSON: {exc}")
            return

        if not isinstance(data, dict) or "levels" not in data:
            self.send_error(HTTPStatus.BAD_REQUEST, "JSON must include a levels array")
            return

        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        tmp = DATA_FILE.with_suffix(".json.tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(DATA_FILE)

        reply = json.dumps({"ok": True, "levels": len(data.get("levels") or [])}).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(reply)))
        self._cors()
        self.end_headers()
        self.wfile.write(reply)
        print(f"[save] Wrote {DATA_FILE} ({len(data.get('levels') or [])} levels)", flush=True)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serving {ROOT}")
    print(f"Exam:  http://{HOST}:{PORT}/")
    print(f"Admin: http://{HOST}:{PORT}/admin/")
    print("POST /api/content saves data/questions.json")
    print("GET  /api/drive/<fileId> proxies Google Drive media")
    print("POST /api/visit registers unique devices")
    print("GET  /api/visitors returns unique visitor count")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
