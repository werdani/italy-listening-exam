#!/usr/bin/env python3
"""
Local static server with APIs for content + Google Drive media proxy.

  python3 server.py
  → http://127.0.0.1:8080/
  → http://127.0.0.1:8080/admin/

POST/PUT /api/content     → writes data/questions.json
GET      /api/content     → returns data/questions.json
GET      /api/drive/<id>  → streams a public Google Drive file (audio/images)
POST     /api/audio        → saves uploaded audio to assets/audio/
POST     /api/pdf          → saves uploaded PDF to assets/pdf/
POST     /api/visit       → register unique device visit
GET      /api/visitors    → unique visitor stats
"""

from __future__ import annotations

import gzip
import hashlib
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
PDF_NAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{1,80}\.pdf$", re.I)
AUDIO_NAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{1,80}\.(mp3|wav|ogg|m4a|aac|webm|flac)$", re.I)
AUDIO_DIR = ROOT / "assets" / "audio"
PDF_DIR = ROOT / "assets" / "pdf"
_visitors_lock = threading.Lock()
_content_lock = threading.Lock()
# In-memory cache for the large questions.json (avoids re-reading ~5MB from disk)
_content_cache: dict = {"mtime_ns": None, "raw": None, "gzip": None, "etag": None}
_visitors_mem: dict | None = None


def sanitize_audio_filename(name: str) -> str:
    """Keep basename only; block path traversal."""
    base = Path(str(name or "audio.mp3")).name.strip()
    if not AUDIO_NAME_RE.match(base):
        raise ValueError("Invalid audio filename")
    return base


def save_audio_file(filename: str, raw: bytes) -> Path:
    if len(raw) > 15 * 1024 * 1024:
        raise ValueError("Audio file too large (max 15 MB)")
    safe = sanitize_audio_filename(filename)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    dest = AUDIO_DIR / safe
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    tmp.write_bytes(raw)
    tmp.replace(dest)
    return dest


def sanitize_pdf_filename(name: str) -> str:
    base = Path(str(name or "document.pdf")).name.strip()
    if not PDF_NAME_RE.match(base):
        raise ValueError("Invalid PDF filename")
    return base


def save_pdf_file(filename: str, raw: bytes) -> Path:
    if len(raw) > 25 * 1024 * 1024:
        raise ValueError("PDF file too large (max 25 MB)")
    safe = sanitize_pdf_filename(filename)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    dest = PDF_DIR / safe
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    tmp.write_bytes(raw)
    tmp.replace(dest)
    return dest


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_visitors() -> dict:
    global _visitors_mem
    if _visitors_mem is not None:
        return _visitors_mem
    if VISITORS_FILE.is_file():
        try:
            data = json.loads(VISITORS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                devices = data.get("devices")
                if not isinstance(devices, dict):
                    devices = {}
                _visitors_mem = {
                    "count": int(data.get("count") or len(devices)),
                    "updatedAt": data.get("updatedAt"),
                    "devices": devices,
                }
                return _visitors_mem
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            pass
    _visitors_mem = {"count": 0, "updatedAt": None, "devices": {}}
    return _visitors_mem


def save_visitors(data: dict) -> None:
    global _visitors_mem
    VISITORS_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "count": int(data.get("count") or 0),
        "updatedAt": data.get("updatedAt"),
        "devices": data.get("devices") or {},
    }
    _visitors_mem = payload
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    tmp = VISITORS_FILE.with_suffix(".json.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(VISITORS_FILE)


def invalidate_content_cache() -> None:
    with _content_lock:
        _content_cache["mtime_ns"] = None
        _content_cache["raw"] = None
        _content_cache["gzip"] = None
        _content_cache["etag"] = None


def get_content_payload() -> tuple[bytes, bytes, str]:
    """Return (raw, gzipped, etag) for questions.json, cached by mtime."""
    if not DATA_FILE.is_file():
        raise FileNotFoundError(str(DATA_FILE))
    mtime_ns = DATA_FILE.stat().st_mtime_ns
    with _content_lock:
        if (
            _content_cache["mtime_ns"] == mtime_ns
            and _content_cache["raw"] is not None
            and _content_cache["gzip"] is not None
            and _content_cache["etag"]
        ):
            return _content_cache["raw"], _content_cache["gzip"], _content_cache["etag"]

        raw = DATA_FILE.read_bytes()
        gz = gzip.compress(raw, compresslevel=5)
        etag = '"' + hashlib.sha1(raw).hexdigest()[:16] + '"'
        _content_cache["mtime_ns"] = mtime_ns
        _content_cache["raw"] = raw
        _content_cache["gzip"] = gz
        _content_cache["etag"] = etag
        return raw, gz, etag


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

    def _cors(self, cache_control: str = "no-store") -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range, If-None-Match, Accept-Encoding")
        self.send_header("Cache-Control", cache_control)
        self.send_header("Vary", "Accept-Encoding")

    def _accepts_gzip(self) -> bool:
        accept = (self.headers.get("Accept-Encoding") or "").lower()
        return "gzip" in accept

    def _send_bytes(
        self,
        raw: bytes,
        content_type: str,
        *,
        etag: str | None = None,
        cache_control: str = "no-cache",
        gzipped: bytes | None = None,
    ) -> None:
        if etag and (self.headers.get("If-None-Match") or "").strip() == etag:
            self.send_response(HTTPStatus.NOT_MODIFIED)
            if etag:
                self.send_header("ETag", etag)
            self._cors(cache_control)
            self.end_headers()
            return

        use_gzip = gzipped is not None and self._accepts_gzip()
        body = gzipped if use_gzip else raw
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if use_gzip:
            self.send_header("Content-Encoding", "gzip")
        if etag:
            self.send_header("ETag", etag)
        self._cors(cache_control)
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        # Avoid stale HTML/CSS while editing admin UI locally
        path = urlparse(self.path).path.lower()
        if path.endswith((".html", ".css", ".js", "/")) or path.endswith("/admin"):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/api/health":
            self._json_response(HTTPStatus.OK, {"ok": True})
            return

        if path == "/api/content":
            self._send_content_file()
            return

        if path == "/api/visitors":
            self._send_visitors()
            return

        if path == "/data/questions.json":
            self._send_content_file()
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
        if path == "/api/audio":
            self._handle_audio_save()
            return
        if path == "/api/pdf":
            self._handle_pdf_save()
            return
        self._handle_save()

    def do_PUT(self) -> None:  # noqa: N802
        self._handle_save()

    def _json_response(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        use_gzip = self._accepts_gzip() and len(raw) > 512
        body = gzip.compress(raw, compresslevel=5) if use_gzip else raw
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if use_gzip:
            self.send_header("Content-Encoding", "gzip")
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
        try:
            raw, gz, etag = get_content_payload()
        except FileNotFoundError:
            self.send_error(HTTPStatus.NOT_FOUND, "questions.json not found")
            return
        self._send_bytes(
            raw,
            "application/json; charset=utf-8",
            etag=etag,
            cache_control="no-cache",
            gzipped=gz,
        )

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

    def _handle_audio_save(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            self.send_error(HTTPStatus.BAD_REQUEST, "Empty body")
            return
        if length > 22 * 1024 * 1024:
            self.send_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Payload too large")
            return

        try:
            body = self.rfile.read(length)
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON")
            return

        filename = str((payload or {}).get("filename") or "").strip()
        content_b64 = str((payload or {}).get("content") or "").strip()
        if not filename or not content_b64:
            self.send_error(HTTPStatus.BAD_REQUEST, "filename and content required")
            return

        import base64

        try:
            raw = base64.b64decode(content_b64, validate=True)
            dest = save_audio_file(filename, raw)
        except ValueError as exc:
            self.send_error(HTTPStatus.BAD_REQUEST, str(exc))
            return
        except Exception as exc:  # noqa: BLE001
            self.send_error(HTTPStatus.BAD_REQUEST, f"Invalid audio data: {exc}")
            return

        rel = f"assets/audio/{dest.name}"
        reply = json.dumps({"ok": True, "path": rel, "filename": dest.name}).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(reply)))
        self._cors()
        self.end_headers()
        self.wfile.write(reply)
        print(f"[audio] Wrote {dest} ({len(raw)} bytes)", flush=True)

    def _handle_pdf_save(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            self.send_error(HTTPStatus.BAD_REQUEST, "Empty body")
            return
        if length > 28 * 1024 * 1024:
            self.send_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Payload too large")
            return

        try:
            body = self.rfile.read(length)
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON")
            return

        filename = str((payload or {}).get("filename") or "").strip()
        content_b64 = str((payload or {}).get("content") or "").strip()
        if not filename or not content_b64:
            self.send_error(HTTPStatus.BAD_REQUEST, "filename and content required")
            return

        import base64

        try:
            raw = base64.b64decode(content_b64, validate=True)
            dest = save_pdf_file(filename, raw)
        except ValueError as exc:
            self.send_error(HTTPStatus.BAD_REQUEST, str(exc))
            return
        except Exception as exc:  # noqa: BLE001
            self.send_error(HTTPStatus.BAD_REQUEST, f"Invalid PDF data: {exc}")
            return

        rel = f"assets/pdf/{dest.name}"
        reply = json.dumps({"ok": True, "path": rel, "filename": dest.name}).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(reply)))
        self._cors()
        self.end_headers()
        self.wfile.write(reply)
        print(f"[pdf] Wrote {dest} ({len(raw)} bytes)", flush=True)

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
        invalidate_content_cache()

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
    print("POST /api/audio saves assets/audio/*.mp3")
    print("POST /api/pdf saves assets/pdf/*.pdf")
    print("GET  /api/drive/<fileId> proxies Google Drive media")
    print("GET  /api/health lightweight ping")
    print("POST /api/visit registers unique devices")
    print("GET  /api/visitors returns unique visitor count")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
