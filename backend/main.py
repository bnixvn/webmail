"""
BNIX Webmail - FastAPI Backend
Serves the webmail UI and all API endpoints.
"""
import asyncio
import base64
import binascii
import hashlib
import json
import os
import re
import socket
import ssl
import time
import unicodedata
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from email.header import Header, decode_header, make_header
from email.message import EmailMessage
from email.parser import BytesParser as EmailParser
from email.policy import default as email_default
from email.utils import formataddr, getaddresses
from functools import partial
from pathlib import Path
from typing import Any, AsyncIterator
from urllib.parse import quote

import aioimaplib
import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

# ─── Config ───────────────────────────────────────────────────────────────────

AUTH_SECRET = os.environ.get(
    "AUTH_SECRET", "An_elNMjOgQouJJCOgPFcChGXNEnXgbDv3E0cQQ6WQM"
)
SESSION_COOKIE = "webmail_session"
SESSION_MAX_AGE = 60 * 60 * 12  # 12 hours
IMAP_TIMEOUT = 60  # seconds
SMTP_TIMEOUT = 30
POOL_TTL = 4 * 60  # 4 minutes

DATA_DIR = os.environ.get("DATA_DIR", "/opt/bnix-webmail/data")
os.makedirs(f"{DATA_DIR}/signatures", exist_ok=True)

# Static files directory (served by FastAPI)
STATIC_DIR = Path(__file__).parent / "static"

# ─── IMAP Pool ────────────────────────────────────────────────────────────────

_pool: dict[str, tuple[aioimaplib.IMAP4_SSL, float]] = {}
_pool_lock = asyncio.Lock()
_executor = ThreadPoolExecutor(4)


async def _get_pooled_imap(email: str, password: str, imap_host: str, imap_port: int) -> aioimaplib.IMAP4_SSL:
    """Get or create a pooled IMAP connection."""
    async with _pool_lock:
        entry = _pool.get(email)
        now = time.time()
        if entry:
            client, last_used = entry
            if now - last_used < POOL_TTL:
                # Trust connection is alive — NOOP can corrupt protocol state
                _pool[email] = (client, now)
                return client
            # Stale — evict
            del _pool[email]
            try:
                await client.logout()
            except Exception:
                pass

        client = aioimaplib.IMAP4_SSL(
            host=imap_host,
            port=imap_port,
            timeout=IMAP_TIMEOUT,
        )
        # aioimaplib requires waiting for server greeting before any command
        await client.wait_hello_from_server()
        await client.login(email, password)
        _pool[email] = (client, now)
        return client


async def _evict_imap(email: str):
    """Remove a broken connection from the pool."""
    async with _pool_lock:
        entry = _pool.pop(email, None)
        if entry:
            try:
                await entry[0].logout()
            except Exception:
                pass


async def _evict_pool():
    """Periodic cleanup of stale IMAP connections."""
    async with _pool_lock:
        now = time.time()
        for email in list(_pool.keys()):
            _, last_used = _pool[email]
            if now - last_used > POOL_TTL:
                del _pool[email]


async def with_imap_retry(session: dict, coro_factory):
    """
    Execute an IMAP operation with automatic retry on connection failure.
    coro_factory: a callable that takes (client) and returns a coroutine.
    """
    email = session["email"]
    domain = email.split("@")[1].lower()
    imap_host = session.get("imap_host") or os.environ.get("IMAP_HOST", "").strip() or await _discover_mail_host(domain, "imap")
    imap_port = int(session.get("imap_port") or os.environ.get("IMAP_PORT", "993"))

    for attempt in range(2):
        try:
            client = await _get_pooled_imap(email, session["password"], imap_host, imap_port)
            return await coro_factory(client)
        except (aioimaplib.Abort, ConnectionError, OSError, asyncio.TimeoutError):
            if attempt == 0:
                await _evict_imap(email)
                continue
            raise


async def _get_imap_for_session(session: dict) -> aioimaplib.IMAP4_SSL:
    """Resolve IMAP config for a session."""
    email = session["email"]
    domain = email.split("@")[1].lower()
    imap_host = session.get("imap_host") or os.environ.get("IMAP_HOST", "").strip() or await _discover_mail_host(domain, "imap")
    imap_port = int(session.get("imap_port") or os.environ.get("IMAP_PORT", "993"))
    return await _get_pooled_imap(email, session["password"], imap_host, imap_port)


async def _discover_mail_host(domain: str, service: str = "imap") -> str:
    """
    Auto-discover mail server — Roundcube-style with TCP probing.
    Tries: mail.{domain} → {domain} → MX record → mail.{domain} (fallback)
    For SMTP, probes both port 465 (SMTPS) and 587 (STARTTLS).
    """
    ports = [993] if service == "imap" else [465, 587]

    candidates = [f"mail.{domain}", domain]

    # Add MX record hosts
    try:
        import dns.resolver
        resolver = dns.resolver.Resolver()
        resolver.timeout = 3
        answers = resolver.resolve(domain, "MX")
        mx_hosts = sorted([str(r.exchange).rstrip(".") for r in answers])
        candidates.extend(mx_hosts)
    except Exception:
        pass

    # Always have mail.{domain} as final fallback
    if f"mail.{domain}" not in candidates:
        candidates.append(f"mail.{domain}")

    # Probe each candidate with TCP connect
    for host in candidates:
        for port in ports:
            try:
                _, writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port, ssl=False),
                    timeout=5,
                )
                writer.close()
                await writer.wait_closed()
                # Return host:port as "host" string for SMTP with non-default port
                if service == "smtp" and port != 465:
                    return f"{host}:{port}"
                return host
            except Exception:
                continue

    # Last resort
    return candidates[0]


# ─── Session (AES-256-GCM, matching Next.js) ──────────────────────────────────

def _session_key() -> bytes:
    return hashlib.sha256(AUTH_SECRET.encode()).digest()


def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64_decode(s: str) -> bytes:
    s += "=" * (-len(s) % 4)  # pad to multiple of 4
    return base64.urlsafe_b64decode(s)


def decrypt_session(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        iv_b64, tag_b64, data_b64 = token.split(".")
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        aesgcm = AESGCM(_session_key())
        decrypted = aesgcm.decrypt(
            _b64_decode(iv_b64),
            _b64_decode(tag_b64) + _b64_decode(data_b64),
            None,
        )
        session = json.loads(decrypted.decode())
        if not session.get("email") or not session.get("password") or not session.get("createdAt"):
            return None
        if time.time() - session["createdAt"] / 1000.0 > SESSION_MAX_AGE:
            return None
        return session
    except Exception:
        return None


def encrypt_session(session: dict) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import secrets

    aesgcm = AESGCM(_session_key())
    iv = secrets.token_bytes(12)
    encrypted = aesgcm.encrypt(iv, json.dumps(session).encode(), None)
    # Node.js AES-256-GCM: ciphertext = tag (16 bytes) + encrypted
    tag = encrypted[:16]
    data = encrypted[16:]
    return f"{_b64_encode(iv)}.{_b64_encode(tag)}.{_b64_encode(data)}"


# ─── Middleware: session ──────────────────────────────────────────────────────

app = FastAPI(title="BNIX Webmail API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def require_session(request: Request) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    session = decrypt_session(token)
    if not session:
        raise HTTPException(401, "Not authenticated.")
    return session


# ─── Pydantic models ──────────────────────────────────────────────────────────

class Address(BaseModel):
    name: str | None = None
    address: str | None = None

    class Config:
        populate_by_name = True


class MessageSummary(BaseModel):
    uid: int
    messageId: str | None = None
    subject: str
    from_: list[Address] = Field(default_factory=lambda: [], alias="from")
    to: list[Address] = Field(default_factory=list)
    date: str | None = None
    flags: list[str] = Field(default_factory=list)
    seen: bool = False
    flagged: bool = False
    snippet: str = ""


class MessageDetail(BaseModel):
    uid: int
    messageId: str | None = None
    subject: str
    from_: list[Address] = Field(default_factory=lambda: [], alias="from")
    to: list[Address] = Field(default_factory=list)
    date: str | None = None
    flags: list[str] = Field(default_factory=list)
    seen: bool = False
    flagged: bool = False
    snippet: str = ""
    cc: list[Address] = Field(default_factory=list)
    bcc: list[Address] = Field(default_factory=list)
    html: str | None = None
    text: str | None = None
    attachments: list[dict] = Field(default_factory=list)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _flags_array(flags) -> list[str]:
    if isinstance(flags, set):
        return [str(f) for f in flags]
    if isinstance(flags, (list, tuple)):
        return [str(f) for f in flags]
    return []


def _addresses(raw) -> list[Address]:
    if not isinstance(raw, (list, tuple)):
        return []
    result = []
    for item in raw:
        # aioimaplib envelope returns: (name_bytes, additive_bytes) tuples
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            name_raw = item[0]
            addr_raw = item[1] if len(item) > 1 else None
            name = name_raw.decode("utf-8", errors="replace").strip('"') if name_raw else None
            addr = addr_raw.decode("utf-8", errors="replace") if addr_raw else None
            result.append(Address(name=name or None, address=addr or None))
        elif isinstance(item, bytes):
            result.append(Address(address=item.decode("utf-8", errors="replace")))
        elif isinstance(item, dict):
            result.append(Address(name=item.get("name"), address=item.get("address")))
        elif isinstance(item, str):
            result.append(Address(address=item))
    return result


def _clean_snippet(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()[:220]


def _sanitize_html(html: str) -> str:
    """Minimal sanitizer: removes XSS vectors, preserves CSS."""
    out = html
    # Remove dangerous tags
    dangerous_tags = [
        r"<script[\s>][\s\S]*?</script>",
        r"<script[\s\S]*?/>",
        r"<noscript[\s>][\s\S]*?</noscript>",
        r"<iframe[\s>][\s\S]*?</iframe>",
        r"<iframe[\s\S]*?/>",
        r"<object[\s>][\s\S]*?</object>",
        r"<embed[\s\S]*?/?>",
        r"<applet[\s>][\s\S]*?</applet>",
        r"<svg[\s>][\s\S]*?</svg>",
        r"<math[\s>][\s\S]*?</math>",
    ]
    for pattern in dangerous_tags:
        out = re.sub(pattern, "", out, flags=re.IGNORECASE)

    # Scope style content
    def _scope_style(m):
        css = m.group(1)
        css = re.sub(r"expression\s*\([^)]*\)", "", css, flags=re.IGNORECASE)
        css = re.sub(r"behavior\s*:", "", css, flags=re.IGNORECASE)
        css = re.sub(r"-moz-binding\s*:", "", css, flags=re.IGNORECASE)
        css = re.sub(r"url\s*\(\s*['\"]?\s*javascript:", "url(about:blank)", css, flags=re.IGNORECASE)

        def _scope_selector(m) -> str:
            sels = m.group(1) if hasattr(m, "group") else str(m)
            scoped = []
            for s in sels.split(","):
                s = s.strip()
                if not s or s.startswith("@") or re.match(r"^\d+%$", s):
                    scoped.append(s)
                else:
                    scoped.append(f".email-html {s}")
            return ", ".join(scoped)

        css = re.sub(r"([^{}]+)\{", _scope_selector, css)
        return f"<style>{css}</style>"

    out = re.sub(r"<style[^>]*>([\s\S]*?)</style>", _scope_style, out, flags=re.IGNORECASE)

    # Remove event handlers
    out = re.sub(r"\s+on[a-z]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", "", out, flags=re.IGNORECASE)

    # Remove javascript: URLs
    out = re.sub(
        r"\b(href|src|action)\s*=\s*(?:\"javascript:[^\"]*\"|'javascript:[^']*')",
        r'\1="#"',
        out,
        flags=re.IGNORECASE,
    )

    # Fix links
    out = re.sub(r"<a\s", '<a rel="noreferrer noopener" target="_blank" ', out)

    return out


async def _async_parse_email(raw_source: bytes) -> dict:
    """Parse raw email source into structured dict (runs in executor to avoid blocking)."""
    def _parse():
        msg = EmailParser(policy=email_default).parsebytes(raw_source)
        text_parts = []
        html_parts = []
        attachments = []
        cid_urls = {}

        def _walk_payload(part):
            if part.is_multipart():
                return

            content_type = part.get_content_type()
            disp = (part.get_content_disposition() or "").lower()
            cid = part.get("content-id", "").strip("<>") or None
            filename = part.get_filename()
            if not filename:
                name = part.get_param("name", header="content-type")
                if name:
                    filename = name

            payload = part.get_payload(decode=True) or b""
            is_attachment = disp in ("attachment", "inline") or bool(filename) or (
                bool(cid) and content_type.startswith("image/")
            )

            if is_attachment:
                index = len(attachments)
                if cid and payload and content_type.startswith("image/"):
                    cid_urls[cid] = f"data:{content_type};base64,{base64.b64encode(payload).decode()}"
                if not filename and content_type.startswith("image/"):
                    ext = content_type.split("/", 1)[1].split(";", 1)[0] or "image"
                    filename = f"inline-{index + 1}.{ext}"
                attachments.append({
                    "index": index,
                    "filename": filename,
                    "contentType": content_type,
                    "size": len(payload),
                    "cid": cid,
                    "disposition": disp or ("inline" if cid else "attachment"),
                })
                return

            if content_type == "text/plain":
                if payload:
                    text_parts.append(payload.decode(part.get_content_charset() or "utf-8", errors="replace"))
            elif content_type == "text/html":
                if payload:
                    html_parts.append(payload.decode(part.get_content_charset() or "utf-8", errors="replace"))

        def _replace_cid_urls(html: str) -> str:
            for cid, data_url in cid_urls.items():
                escaped = re.escape(cid)
                html = re.sub(rf"cid:{escaped}", data_url, html, flags=re.IGNORECASE)
                html = re.sub(rf"cid:{re.escape(quote(cid))}", data_url, html, flags=re.IGNORECASE)
            return html

        if msg.is_multipart():
            for part in msg.walk():
                _walk_payload(part)
        else:
            _walk_payload(msg)

        html = html_parts[0] if html_parts else None
        if html:
            html = _replace_cid_urls(html)

        return {
            "text": "\n".join(text_parts) or None,
            "html": html,
            "attachments": attachments,
        }

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _parse)


async def _async_get_attachment(raw_source: bytes, index: int) -> dict | None:
    """Return a decoded attachment part by the UI attachment index."""
    def _parse():
        msg = EmailParser(policy=email_default).parsebytes(raw_source)
        attachments = []

        for part in msg.walk() if msg.is_multipart() else [msg]:
            if part.is_multipart():
                continue

            content_type = part.get_content_type()
            disp = (part.get_content_disposition() or "").lower()
            cid = part.get("content-id", "").strip("<>") or None
            filename = part.get_filename()
            if not filename:
                name = part.get_param("name", header="content-type")
                if name:
                    filename = name
            payload = part.get_payload(decode=True) or b""
            is_attachment = disp in ("attachment", "inline") or bool(filename) or (
                bool(cid) and content_type.startswith("image/")
            )
            if not is_attachment:
                continue

            current_index = len(attachments)
            if not filename and content_type.startswith("image/"):
                ext = content_type.split("/", 1)[1].split(";", 1)[0] or "image"
                filename = f"inline-{current_index + 1}.{ext}"
            attachments.append({
                "index": current_index,
                "filename": filename or f"attachment-{current_index + 1}",
                "contentType": content_type,
                "payload": payload,
            })

        for item in attachments:
            if item["index"] == index:
                return item
        return None

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _parse)


async def _fetch_message_source(session: dict, folder: str, uid: int) -> tuple[str | None, bytes | None]:
    async def _do(client):
        select_resp = await client.select(_quote_imap_folder(folder))
        _require_imap_ok(select_resp, f"SELECT {folder}")
        fetch_resp = await client.uid("FETCH", str(uid), "(UID FLAGS INTERNALDATE BODY.PEEK[])")
        _require_imap_ok(fetch_resp, "UID FETCH")
        for meta, source in _iter_fetch_literals(fetch_resp):
            if _fetch_uid(meta, uid) == uid:
                return meta, source
        return None, None

    return await with_imap_retry(session, _do)


def _envelope_summary(msg: Any, snippet: str = "") -> dict:
    flags = _flags_array(getattr(msg, "flags", []) or [])
    envelope = getattr(msg, "envelope", None) or {}
    return {
        "uid": int(getattr(msg, "uid", 0)),
        "messageId": envelope.get("message_id", None),
        "subject": envelope.get("subject", "(No subject)") or "(No subject)",
        "from": _addresses(envelope.get("from", [])),
        "to": _addresses(envelope.get("to", [])),
        "date": _iso_date(envelope.get("date")),
        "flags": flags,
        "seen": "\\Seen" in flags,
        "flagged": "\\Flagged" in flags,
        "snippet": snippet,
    }


def _iso_date(date_val) -> str | None:
    if date_val is None:
        return None
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(date_val).isoformat()
    except Exception:
        return str(date_val)


def _imap_lines(response) -> list[Any]:
    """Return response lines from aioimaplib.Response or older tuple-style data."""
    if hasattr(response, "lines"):
        return list(response.lines or [])
    if isinstance(response, tuple) and len(response) >= 2:
        payload = response[1]
        if isinstance(payload, (list, tuple)):
            return list(payload)
        return [payload] if payload else []
    if isinstance(response, (list, tuple)):
        return list(response)
    return []


def _imap_result(response) -> str | None:
    if hasattr(response, "result"):
        return str(response.result)
    if isinstance(response, tuple) and response:
        first = response[0]
        if isinstance(first, bytes):
            return first.decode("utf-8", errors="replace")
        return str(first)
    return None


def _imap_text(value) -> str:
    if isinstance(value, bytearray):
        value = bytes(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def _imap_bytes(value) -> bytes:
    if isinstance(value, bytearray):
        return bytes(value)
    if isinstance(value, bytes):
        return value
    if isinstance(value, str):
        return value.encode()
    return b""


def _require_imap_ok(response, action: str):
    result = _imap_result(response)
    if result and result.upper() != "OK":
        detail = "; ".join(_imap_text(line) for line in _imap_lines(response)[:2])
        raise HTTPException(502, f"IMAP {action} failed: {detail or result}")


SPECIAL_MAILBOXES = {
    "sent": {
        "special": "\\Sent",
        "names": ["Sent", "Sent Messages", "Sent Items", "Sent Mail", "INBOX.Sent", "INBOX/Sent"],
    },
    "archive": {
        "special": "\\Archive",
        "names": ["Archive", "Archives", "INBOX.Archive", "INBOX/Archive"],
    },
    "junk": {
        "special": "\\Junk",
        "names": ["Junk", "Spam", "Bulk Mail", "INBOX.Junk", "INBOX.Spam", "INBOX/Junk", "INBOX/Spam"],
    },
    "trash": {
        "special": "\\Trash",
        "names": ["Trash", "Deleted Messages", "Deleted Items", "Deleted", "Bin", "INBOX.Trash", "INBOX/Trash"],
    },
    "drafts": {
        "special": "\\Drafts",
        "names": ["Drafts", "Draft", "INBOX.Drafts", "INBOX/Drafts"],
    },
}


def _imap_ok(response) -> bool:
    result = _imap_result(response)
    return bool(result and result.upper() == "OK")


def _imap_response_detail(response) -> str:
    return "; ".join(_imap_text(line) for line in _imap_lines(response)[:3]) or (_imap_result(response) or "")


def _fold_mailbox_text(value: str) -> str:
    value = (value or "").replace("Đ", "D").replace("đ", "d")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return value.casefold().strip()


def _mailbox_leaf(path: str) -> str:
    parts = re.split(r"[./\\]+", path or "")
    return next((p for p in reversed(parts) if p), path or "")


def _canonical_mailbox_role(role: str | None) -> str | None:
    role = (role or "").casefold().strip().lstrip("\\")
    if role == "spam":
        role = "junk"
    return role if role in SPECIAL_MAILBOXES else None


def _role_for_mailbox_name(name: str) -> str | None:
    folded = _fold_mailbox_text(name)
    leaf = _fold_mailbox_text(_mailbox_leaf(name))
    for role, info in SPECIAL_MAILBOXES.items():
        aliases = {_fold_mailbox_text(n) for n in info["names"]}
        aliases.add(role)
        if role == "junk":
            aliases.add("spam")
        if folded in aliases or leaf in aliases:
            return role
    return None


def _special_use_from_flags(flags: list[str]) -> str | None:
    lowered = {flag.casefold(): flag for flag in flags}
    for info in SPECIAL_MAILBOXES.values():
        special = info["special"]
        if special.casefold() in lowered:
            return special
    return None


def _mailbox_exact(path_a: str, path_b: str) -> bool:
    return (path_a or "") == (path_b or "") or _fold_mailbox_text(path_a) == _fold_mailbox_text(path_b)


def _mailbox_info_matches_role(mailbox: dict, role: str) -> bool:
    role = _canonical_mailbox_role(role)
    if not role:
        return False
    special = (mailbox.get("specialUse") or "").casefold()
    if special and special == SPECIAL_MAILBOXES[role]["special"].casefold():
        return True
    return _role_for_mailbox_name(mailbox.get("path") or mailbox.get("name") or "") == role


def _parse_mailbox_list_line(line: Any) -> dict | None:
    line_text = _imap_text(line).strip()
    if not line_text:
        return None
    match = re.match(
        r"^(?:\* LIST\s+)?\((?P<flags>.*?)\)\s+"
        r"(?P<delim>NIL|\"(?:\\.|[^\"])*\"|\S+)\s+"
        r"(?P<name>\"(?:\\.|[^\"])*\"|.+)$",
        line_text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    flags = match.group("flags").split()
    delim = _unquote_imap_token(match.group("delim")) or "/"
    name = _unquote_imap_token(match.group("name"))
    if not name:
        return None
    return {"flags": flags, "delimiter": delim, "path": name}


async def _list_mailboxes_for_client(client, include_status: bool = False) -> list[dict]:
    list_resp = await client.list('""', "*")
    _require_imap_ok(list_resp, "LIST")

    mailboxes = []
    for line in _imap_lines(list_resp):
        parsed = _parse_mailbox_list_line(line)
        if not parsed:
            continue

        name = parsed["path"]
        delim = parsed["delimiter"]
        flags = parsed["flags"]
        msgs, unseen = 0, 0

        if include_status:
            try:
                status_resp = await client.status(_quote_imap_folder(name), "(MESSAGES UNSEEN)")
                _require_imap_ok(status_resp, f"STATUS {name}")
                status_str = next(
                    (_imap_text(item) for item in _imap_lines(status_resp) if "MESSAGES" in _imap_text(item)),
                    "",
                )
                msgs_match = re.search(r"MESSAGES\s+(\d+)", status_str)
                unseen_match = re.search(r"UNSEEN\s+(\d+)", status_str)
                msgs = int(msgs_match.group(1)) if msgs_match else 0
                unseen = int(unseen_match.group(1)) if unseen_match else 0
            except Exception:
                msgs, unseen = 0, 0

        mailboxes.append({
            "path": name,
            "name": name,
            "delimiter": delim,
            "specialUse": _special_use_from_flags(flags),
            "total": msgs,
            "unseen": unseen,
            "depth": name.count(delim) if delim and delim in name else 0,
        })

    return mailboxes


async def _create_mailbox_if_missing(client, path: str) -> str:
    create_resp = await client.create(_quote_imap_folder(path))
    if _imap_ok(create_resp):
        try:
            await client.subscribe(_quote_imap_folder(path))
        except Exception:
            pass
        return path

    detail = _imap_response_detail(create_resp)
    if "exist" in detail.casefold() or "already" in detail.casefold():
        return path
    raise HTTPException(502, f"IMAP CREATE {path} failed: {detail or _imap_result(create_resp)}")


async def _ensure_mailbox(client, destination: str, role: str | None = None) -> str:
    destination = (destination or "").strip()
    if not destination and not role:
        raise HTTPException(400, "Destination folder is required.")

    role = _canonical_mailbox_role(role) or _role_for_mailbox_name(destination)
    mailboxes = await _list_mailboxes_for_client(client)

    if destination:
        for mb in mailboxes:
            if _mailbox_exact(mb["path"], destination):
                return mb["path"]

    if role:
        for mb in mailboxes:
            if _mailbox_info_matches_role(mb, role):
                return mb["path"]

        candidates = []
        if destination:
            candidates.append(destination)
        candidates.extend(SPECIAL_MAILBOXES[role]["names"])
        last_error: HTTPException | None = None
        seen: set[str] = set()
        for candidate in candidates:
            folded = _fold_mailbox_text(candidate)
            if not candidate or folded in seen:
                continue
            seen.add(folded)
            try:
                return await _create_mailbox_if_missing(client, candidate)
            except HTTPException as exc:
                last_error = exc
                continue
        if last_error:
            raise last_error

    return await _create_mailbox_if_missing(client, destination)


def _decode_header_value(value) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(str(value))))
    except Exception:
        return str(value)


def _header_addresses(value) -> list[dict]:
    result = []
    for name, addr in getaddresses([str(value or "")]):
        display_name = _decode_header_value(name).strip() or None
        email_addr = (addr or "").strip() or None
        if display_name or email_addr:
            result.append({"name": display_name, "address": email_addr})
    return result


def _unquote_imap_token(value: str) -> str:
    value = value.strip()
    if value.upper() == "NIL":
        return ""
    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        value = value[1:-1].replace(r"\\", "\\").replace(r"\"", '"')
    return _decode_modified_utf7(value)


def _quote_imap_folder(folder: str) -> str:
    """
    Convert folder name from display UTF-8 to IMAP Modified UTF-7,
    then quote it for use in IMAP commands.
    IMAP requires folder names to be either ASCII atoms (7-bit)
    or Modified UTF-7 (RFC 3501) inside double-quotes.
    """
    # Encode UTF-8 → Modified UTF-7
    mutf7 = _encode_modified_utf7(folder)
    # Quote if needed
    needs_quote = any(ord(c) > 127 or c in ("(", ")", "{", " ", "%", "*", '"', "\\") for c in mutf7)
    if not needs_quote:
        return mutf7
    # Escape backslashes and double-quotes for IMAP quoted-string
    escaped = mutf7.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _encode_modified_utf7(s: str) -> str:
    """
    Encode a UTF-8 string to IMAP Modified UTF-7 (RFC 3501).
    ASCII chars are passed through literally.
    Non-ASCII chars are encoded as base64 of UTF-16BE, wrapped in &...-.
    The shift char is '+', and ',' is used instead of '/' in base64.
    """
    import base64
    result = []
    i = 0
    while i < len(s):
        c = ord(s[i])
        if c <= 0x7F:
            # ASCII: pass through literally, escape '&'
            if c == 0x26:  # '&'
                result.append("&-")  # shift out, literal '&', shift back
            else:
                result.append(chr(c))
            i += 1
        else:
            # Non-ASCII: collect run of non-ASCII chars
            start = i
            while i < len(s) and ord(s[i]) > 0x7F:
                i += 1
            chunk = s[start:i]
            # Encode as UTF-16BE, then base64
            utf16 = chunk.encode("utf-16-be")
            b64 = base64.b64encode(utf16).decode("ascii")
            # Modified UTF-7 uses ',' instead of '/' in base64 and strips padding
            b64 = b64.replace("/", ",")
            b64 = b64.rstrip("=")
            result.append(f"&{b64}-")
    return "".join(result)


def _decode_modified_utf7(s: str) -> str:
    """Decode IMAP Modified UTF-7 (RFC 3501) to UTF-8."""
    if "&" not in s:
        return s
    result = []
    i = 0
    while i < len(s):
        amp = s.find("&", i)
        if amp == -1:
            result.append(s[i:])
            break
        result.append(s[i:amp])
        # Find the closing '-' (shift back to ASCII)
        dash = s.find("-", amp + 1)
        if dash == -1:
            # Unclosed shift — treat rest as literal
            result.append(s[amp:])
            break
        encoded = s[amp + 1:dash]
        if not encoded:
            # "&&-" or just "&-" → literal '&'
            result.append("&")
        else:
            # Modified UTF-7: &...- encodes UTF-16BE as base64 (with ',' instead of '+')
            try:
                # Modified UTF-7 uses ',' instead of '/' in base64
                b64 = encoded.replace(",", "/")
                # Pad to multiple of 4
                b64 += "=" * (-len(b64) % 4)
                decoded = base64.b64decode(b64)
                result.append(decoded.decode("utf-16-be"))
            except Exception:
                # Invalid base64 — keep raw
                result.append(s[amp:dash + 1])
        i = dash + 1
    return "".join(result)


def _fetch_uid(meta: str, fallback: int = 0) -> int:
    match = re.search(r"\bUID\s+(\d+)\b", meta)
    return int(match.group(1)) if match else fallback


def _fetch_flags(meta: str) -> list[str]:
    match = re.search(r"\bFLAGS\s+\(([^)]*)\)", meta)
    if not match:
        return []
    return [flag for flag in match.group(1).split() if flag]


def _iter_fetch_literals(response):
    """Yield (FETCH metadata line, literal bytes) pairs from aioimaplib FETCH response."""
    meta = None
    for item in _imap_lines(response):
        text = _imap_text(item)
        if re.match(r"^\d+\s+FETCH\b", text, flags=re.IGNORECASE):
            meta = text
            continue

        if meta is None:
            continue

        literal = _imap_bytes(item)
        if not literal or literal.strip() == b")":
            continue

        yield meta, literal
        meta = None


def _summary_from_header_source(uid: int, meta: str, raw_source: bytes, snippet: str = "") -> dict:
    parsed = EmailParser(policy=email_default).parsebytes(raw_source)
    flags = _fetch_flags(meta)
    return {
        "uid": uid,
        "messageId": parsed.get("Message-ID"),
        "inReplyTo": parsed.get("In-Reply-To"),
        "references": parsed.get("References"),
        "subject": _decode_header_value(parsed.get("Subject")) or "(No subject)",
        "from": _header_addresses(parsed.get("From")),
        "to": _header_addresses(parsed.get("To")),
        "date": _iso_date(parsed.get("Date")),
        "flags": flags,
        "seen": "\\Seen" in flags,
        "flagged": "\\Flagged" in flags,
        "snippet": snippet,
    }


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"ok": True}


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
async def login(request: Request, body: dict):
    email = (body.get("email") or "").lower().strip()
    password = body.get("password") or ""
    remember = body.get("remember", True)
    imap_host_override = (body.get("imapHost") or "").strip()
    imap_port_override = body.get("imapPort") or ""
    smtp_host_override = (body.get("smtpHost") or "").strip()
    smtp_port_override = body.get("smtpPort") or ""

    if not email or "@" not in email or not password:
        raise HTTPException(400, "Invalid credentials.")

    # Resolve IMAP server
    domain = email.split("@")[1].lower()
    imap_host = imap_host_override or os.environ.get("IMAP_HOST", "").strip() or await _discover_mail_host(domain, "imap")
    imap_port = int(imap_port_override or os.environ.get("IMAP_PORT", "993"))

    # Resolve SMTP server (for sending)
    smtp_host_raw = smtp_host_override or os.environ.get("SMTP_HOST", "").strip() or await _discover_mail_host(domain, "smtp")
    if ":" in smtp_host_raw and not smtp_host_raw.startswith("["):
        smtp_host, smtp_discovered_port = smtp_host_raw.rsplit(":", 1)
        smtp_port = int(smtp_port_override or smtp_discovered_port)
    else:
        smtp_host = smtp_host_raw
        smtp_port = int(smtp_port_override or os.environ.get("SMTP_PORT", "465"))

    client = aioimaplib.IMAP4_SSL(host=imap_host, port=imap_port, timeout=IMAP_TIMEOUT)
    try:
        await client.wait_hello_from_server()
        await client.login(email, password)
        await client.logout()
    except Exception as e:
        raise HTTPException(401, "Invalid email or password.")

    session = {
        "email": email,
        "password": password,
        "createdAt": int(time.time() * 1000),
        "imap_host": imap_host,
        "imap_port": imap_port,
        "smtp_host": smtp_host,
        "smtp_port": smtp_port,
    }
    # Store server overrides in session if user provided them
    if imap_host_override:
        session["imap_host"] = imap_host_override
    if imap_port_override:
        session["imap_port"] = int(imap_port_override)
    if smtp_host_override:
        session["smtp_host"] = smtp_host_override
    if smtp_port_override:
        session["smtp_port"] = int(smtp_port_override)

    response = JSONResponse({"email": email, "domain": domain})
    response.set_cookie(
        key=SESSION_COOKIE,
        value=encrypt_session(session),
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
        max_age=SESSION_MAX_AGE if remember else None,
    )
    return response


@app.post("/api/auth/logout")
async def logout(request: Request):
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@app.get("/api/auth/me")
async def me(request: Request):
    session = await require_session(request)
    return {"authenticated": True, "email": session["email"], "domain": session["email"].split("@")[1]}


# ── Mailboxes ──────────────────────────────────────────────────────────────────

@app.get("/api/mailboxes")
async def list_mailboxes(request: Request):
    session = await require_session(request)

    async def _do(client):
        return await _list_mailboxes_for_client(client, include_status=True)

    mailboxes = await with_imap_retry(session, _do)
    return JSONResponse({"mailboxes": mailboxes})


@app.post("/api/mailboxes")
async def create_mailbox(request: Request, body: dict):
    session = await require_session(request)
    path = (body.get("path") or "").strip()
    if not path:
        raise HTTPException(400, "Path is required.")

    async def _do(client):
        await _create_mailbox_if_missing(client, path)

    await with_imap_retry(session, _do)
    return JSONResponse({"ok": True, "path": path}, status_code=201)


# ── Messages ──────────────────────────────────────────────────────────────────

@app.get("/api/messages")
async def list_messages(request: Request):
    session = await require_session(request)
    folder = request.query_params.get("folder", "INBOX")
    limit = min(int(request.query_params.get("limit", "40")), 100)
    offset = max(int(request.query_params.get("offset", "0")), 0)

    async def _do(client):
        select_resp = await client.select(_quote_imap_folder(folder))
        _require_imap_ok(select_resp, f"SELECT {folder}")

        search_resp = await client.uid_search("ALL")
        _require_imap_ok(search_resp, "UID SEARCH")
        uids: list[str] = []
        for item in _imap_lines(search_resp):
            text = _imap_text(item).strip()
            if re.fullmatch(r"[\d\s]+", text):
                uids.extend(text.split())

        total = len(uids)

        if not uids or offset >= total:
            return []

        page_uids = uids[-(offset + limit) : -offset if offset else None]
        if not page_uids:
            page_uids = uids[-limit:]

        uid_set = ",".join(page_uids)
        fetch_resp = await client.uid(
            "FETCH",
            uid_set,
            "(UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO DATE)])",
        )
        _require_imap_ok(fetch_resp, "UID FETCH")
        return fetch_resp, total

    result = await with_imap_retry(session, _do)
    if not result:
        return JSONResponse({"messages": [], "total": 0, "offset": offset, "limit": limit})

    messages_data, total = result

    messages = []
    for meta, msg_data in _iter_fetch_literals(messages_data):
        try:
            uid = _fetch_uid(meta)
            if uid:
                messages.append(_summary_from_header_source(uid, meta, msg_data))
        except Exception:
            pass

    messages.sort(key=lambda m: m["uid"], reverse=True)
    return JSONResponse({
        "messages": messages,
        "total": total,
        "offset": offset,
        "limit": limit,
    })


def _chunk_messages(data) -> list:
    """Chunk IMAP fetch response into (uid_str, message_data) pairs."""
    result = []
    if not data:
        return result
    if isinstance(data, dict):
        items = list(data.items())
    elif isinstance(data, (list, tuple)):
        items = []
        i = 0
        while i < len(data):
            item = data[i]
            if isinstance(item, (bytes, str)) and re.match(r"\d+.*UID", str(item)):
                uid_str = str(item)
                if i + 1 < len(data):
                    items.append((uid_str, data[i + 1]))
                    i += 2
                    continue
            i += 1
    else:
        items = []
    return items



@app.get("/api/thread")
async def get_thread(request: Request):
    """
    Find all messages belonging to a thread across multiple folders.
    Searches by subject (normalized) in INBOX + Sent folder, then merges.
    Returns summaries sorted oldest→newest.
    """
    session = await require_session(request)
    subject_raw = request.query_params.get("subject", "")
    current_folder = request.query_params.get("folder", "INBOX")
    if not subject_raw:
        raise HTTPException(400, "subject is required")

    # Normalize subject: strip Re:/Fwd: prefixes
    norm_subject = re.sub(r"^(Re|Fwd?|Tr|Fw):\s*", "", subject_raw, flags=re.IGNORECASE).strip()

    # Discover Sent folder name
    async def _find_sent_folder(client):
        for mailbox in await _list_mailboxes_for_client(client):
            if _mailbox_info_matches_role(mailbox, "sent"):
                return mailbox["path"]
        return None

    sent_folder = None
    try:
        sent_folder = await with_imap_retry(session, _find_sent_folder)
    except Exception:
        pass

    # Folders to search: current + Sent (deduplicated)
    folders_to_search = [current_folder]
    if sent_folder and sent_folder.upper() != current_folder.upper():
        folders_to_search.append(sent_folder)

    all_summaries: list[dict] = []

    for folder in folders_to_search:
        async def _search_folder(client, _folder=folder, _subj=norm_subject):
            try:
                sel = await client.select(_quote_imap_folder(_folder), readonly=True)
                _require_imap_ok(sel, f"SELECT {_folder}")
                # IMAP SEARCH by subject text
                search_resp = await client.uid("SEARCH", "SUBJECT", f'"{_subj}"')
                _require_imap_ok(search_resp, "UID SEARCH SUBJECT")
                uids: list[str] = []
                for item in _imap_lines(search_resp):
                    txt = _imap_text(item).strip()
                    if re.fullmatch(r"[\d\s]+", txt):
                        uids.extend(txt.split())
                if not uids:
                    return []
                uid_set = ",".join(uids[-50:])
                fetch_resp = await client.uid(
                    "FETCH", uid_set,
                    "(UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO DATE MESSAGE-ID IN-REPLY-TO REFERENCES)])"
                )
                _require_imap_ok(fetch_resp, "UID FETCH thread")
                results = []
                for meta, msg_data in _iter_fetch_literals(fetch_resp):
                    try:
                        uid = _fetch_uid(meta)
                        if uid:
                            s = _summary_from_header_source(uid, meta, msg_data)
                            s["folder"] = _folder
                            results.append(s)
                    except Exception:
                        pass
                return results
            except Exception:
                return []

        try:
            msgs = await with_imap_retry(session, _search_folder)
            all_summaries.extend(msgs)
        except Exception:
            pass

    # Deduplicate by messageId, then by uid+folder
    seen_ids: set[str] = set()
    seen_uid_folder: set[tuple] = set()
    deduped = []
    for m in all_summaries:
        mid = (m.get("messageId") or "").strip()
        uf = (m["uid"], m.get("folder", ""))
        if mid and mid in seen_ids:
            continue
        if uf in seen_uid_folder:
            continue
        if mid:
            seen_ids.add(mid)
        seen_uid_folder.add(uf)
        deduped.append(m)

    # Sort oldest → newest by uid (proxy for date within same server)
    deduped.sort(key=lambda m: m["uid"])

    return JSONResponse({"messages": deduped})


@app.get("/api/messages/{uid}")
async def get_message(request: Request, uid: int):
    session = await require_session(request)
    folder = request.query_params.get("folder", "INBOX")

    async def _do(client):
        select_resp = await client.select(_quote_imap_folder(folder))
        _require_imap_ok(select_resp, f"SELECT {folder}")
        fetch_resp = await client.uid("FETCH", str(uid), "(UID FLAGS INTERNALDATE BODY.PEEK[])")
        _require_imap_ok(fetch_resp, "UID FETCH")
        for meta, source in _iter_fetch_literals(fetch_resp):
            if _fetch_uid(meta, uid) == uid:
                return meta, source
        return None, None

    try:
        meta, source = await asyncio.wait_for(with_imap_retry(session, _do), timeout=60)
    except asyncio.TimeoutError:
        raise HTTPException(504, "Message fetch timed out.")
    if not source:
        raise HTTPException(404, "Message not found.")

    async def _mark_seen(client):
        select_resp = await client.select(_quote_imap_folder(folder))
        _require_imap_ok(select_resp, f"SELECT {folder}")
        store_resp = await client.uid("STORE", str(uid), "+FLAGS", "\\Seen")
        _require_imap_ok(store_resp, "UID STORE")

    try:
        message = EmailParser(policy=email_default).parsebytes(source)
        summary = _summary_from_header_source(uid, meta or "", source)
        summary["cc"] = _header_addresses(message.get("Cc"))
        summary["bcc"] = _header_addresses(message.get("Bcc"))
        summary["html"] = None
        summary["text"] = None
        summary["attachments"] = []

        parsed = await _async_parse_email(source)
        summary["snippet"] = _clean_snippet(parsed.get("text", ""))
        html = parsed.get("html")
        summary["html"] = _sanitize_html(html) if html else None
        summary["text"] = parsed.get("text")
        summary["attachments"] = parsed.get("attachments", [])

        if "\\Seen" not in summary["flags"]:
            try:
                await with_imap_retry(session, _mark_seen)
            except Exception:
                pass

    except asyncio.TimeoutError:
        raise
    except Exception as e:
        raise HTTPException(502, f"Message parse failed: {e}")

    return JSONResponse({"message": summary})


@app.get("/api/messages/{uid}/attachments/{index}")
async def get_attachment(request: Request, uid: int, index: int):
    session = await require_session(request)
    folder = request.query_params.get("folder", "INBOX")
    download = request.query_params.get("download") == "1"

    _, source = await _fetch_message_source(session, folder, uid)
    if not source:
        raise HTTPException(404, "Message not found.")

    attachment = await _async_get_attachment(source, index)
    if not attachment:
        raise HTTPException(404, "Attachment not found.")

    filename = attachment["filename"] or f"attachment-{index + 1}"
    disposition = "attachment" if download else "inline"
    safe_name = quote(filename)
    headers = {
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{safe_name}",
        "Cache-Control": "private, max-age=300",
    }
    return Response(
        content=attachment["payload"],
        media_type=attachment["contentType"] or "application/octet-stream",
        headers=headers,
    )


@app.patch("/api/messages/{uid}/flags")
async def update_flags(request: Request, uid: int, body: dict):
    session = await require_session(request)
    folder = body.get("folder", "INBOX")
    flag = body.get("flag", "\\Seen")
    enabled = bool(body.get("enabled", True))

    async def _do(client):
        select_resp = await client.select(_quote_imap_folder(folder))
        _require_imap_ok(select_resp, f"SELECT {folder}")
        cmd = "+FLAGS" if enabled else "-FLAGS"
        store_resp = await client.uid("STORE", str(uid), cmd, flag)
        _require_imap_ok(store_resp, "UID STORE")

    await with_imap_retry(session, _do)
    return JSONResponse({"ok": True})


@app.post("/api/messages/{uid}/move")
async def move_message(request: Request, uid: int, body: dict):
    session = await require_session(request)
    folder = body.get("folder", "INBOX")
    destination = body.get("destination", "Trash")

    async def _do(client):
        target = await _ensure_mailbox(client, destination)
        select_resp = await client.select(_quote_imap_folder(folder))
        _require_imap_ok(select_resp, f"SELECT {folder}")

        copy_resp = await client.uid("COPY", str(uid), _quote_imap_folder(target))
        if not _imap_ok(copy_resp) and "TRYCREATE" in _imap_response_detail(copy_resp).upper():
            target = await _create_mailbox_if_missing(client, target)
            copy_resp = await client.uid("COPY", str(uid), _quote_imap_folder(target))
        _require_imap_ok(copy_resp, "UID COPY")

        store_resp = await client.uid("STORE", str(uid), "+FLAGS", "\\Deleted")
        _require_imap_ok(store_resp, "UID STORE")
        expunge_resp = await client.expunge()
        _require_imap_ok(expunge_resp, "EXPUNGE")
        return target

    target = await with_imap_retry(session, _do)
    return JSONResponse({"ok": True, "destination": target})


@app.delete("/api/messages/{uid}")
async def delete_message(request: Request, uid: int):
    session = await require_session(request)
    folder = request.query_params.get("folder", "INBOX")

    async def _do(client):
        select_resp = await client.select(_quote_imap_folder(folder))
        _require_imap_ok(select_resp, f"SELECT {folder}")
        store_resp = await client.uid("STORE", str(uid), "+FLAGS", "\\Deleted")
        _require_imap_ok(store_resp, "UID STORE")
        expunge_resp = await client.expunge()
        _require_imap_ok(expunge_resp, "EXPUNGE")

    await with_imap_retry(session, _do)
    return JSONResponse({"ok": True})


# ── Send ───────────────────────────────────────────────────────────────────────

@app.post("/api/messages/send")
async def send_message(request: Request, body: dict):
    session = await require_session(request)
    email = session["email"]
    password = session["password"]

    # Parse recipients
    def parse_recipients(value: str) -> list[str]:
        if not value:
            return []
        emails = re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", value, re.IGNORECASE)
        return list(dict.fromkeys(e.lower() for e in emails))

    to_recipients = parse_recipients(body.get("to", ""))
    cc_recipients = parse_recipients(body.get("cc", ""))
    bcc_recipients = parse_recipients(body.get("bcc", ""))
    if not to_recipients:
        raise HTTPException(400, "At least one recipient is required.")

    subject = body.get("subject", "(No subject)")
    text = body.get("text", "")
    html = body.get("html")
    from_name = body.get("fromName", "")
    reply_to = body.get("replyTo", "")

    # Build MIME email with proper RFC 2047/UTF-8 header encoding.
    mime_message = EmailMessage()
    if from_name:
        mime_message["From"] = formataddr((str(Header(from_name, "utf-8")), email))
    else:
        mime_message["From"] = email
    mime_message["To"] = ", ".join(to_recipients)
    if cc_recipients:
        mime_message["Cc"] = ", ".join(cc_recipients)
    mime_message["Subject"] = str(Header(subject, "utf-8"))
    if reply_to:
        mime_message["Reply-To"] = reply_to

    # Threading headers
    in_reply_to = body.get("inReplyTo", "")
    references = body.get("references", "")
    if in_reply_to:
        mime_message["In-Reply-To"] = in_reply_to
        mime_message["References"] = (references + " " + in_reply_to).strip() if references else in_reply_to

    if html:
        mime_message.set_content(text or "", subtype="plain", charset="utf-8")
        mime_message.add_alternative(html, subtype="html", charset="utf-8")
    else:
        mime_message.set_content(text or "", subtype="plain", charset="utf-8")

    # Attachments
    attachments = body.get("attachments", [])
    for att in attachments:
        att_name = att.get("name", "attachment")
        mime_type = att.get("type", "application/octet-stream")
        data_b64 = att.get("data", "")
        # Strip data URL prefix if present (e.g. "data:application/pdf;base64,ABC...")
        if data_b64 and "," in data_b64[:100]:
            data_b64 = data_b64.split(",", 1)[1]
        if data_b64:
            try:
                data_bytes = base64.b64decode(data_b64)
                main, sub = (mime_type.split("/") + ["octet-stream"])[:2]
                mime_message.add_attachment(
                    data_bytes,
                    maintype=main,
                    subtype=sub,
                    filename=att_name,
                )
            except Exception:
                pass  # Skip invalid attachments

    # Send via SMTP
    domain = email.split("@")[1].lower()
    smtp_host_raw = session.get("smtp_host") or os.environ.get("SMTP_HOST", "").strip() or await _discover_mail_host(domain, "smtp")
    # Handle host:port format from discovery (e.g., "mail.domain.com:587")
    if ":" in smtp_host_raw and not smtp_host_raw.startswith("["):
        smtp_host, discovered_port = smtp_host_raw.rsplit(":", 1)
        smtp_port = int(session.get("smtp_port") or discovered_port)
    else:
        smtp_host = smtp_host_raw
        smtp_port = int(session.get("smtp_port") or os.environ.get("SMTP_PORT", "465"))
    smtp_secure = os.environ.get("SMTP_SECURE", "true").lower() != "false"

    import aiosmtplib

    smtp = aiosmtplib.SMTP(
        hostname=smtp_host,
        port=smtp_port,
        use_tls=smtp_secure and smtp_port == 465,
        start_tls=smtp_secure and smtp_port != 465,
        timeout=SMTP_TIMEOUT,
    )
    try:
        await smtp.connect()
        await smtp.login(email, password)
        all_recipients = to_recipients + cc_recipients + bcc_recipients
        print(f"[SMTP] Sending from {email} to {all_recipients} via {smtp_host}:{smtp_port}")
        await smtp.send_message(
            mime_message,
            sender=email,
            recipients=all_recipients,
        )
        await smtp.quit()
        print(f"[SMTP] Send ok — from {email} to {all_recipients}")
    except Exception as e:
        print(f"[SMTP] Failed: {e}")
        raise HTTPException(502, f"SMTP error: {e}")

    # Save copy to Sent folder. Do not fail the SMTP send if IMAP append fails,
    # but surface the warning to the UI so the user is not misled.
    sent_folder = (body.get("sentFolder") or "").strip()
    sent_saved = False
    sent_error = None

    try:
        raw_bytes = mime_message.as_bytes()

        async def _append_sent(client):
            target = await _ensure_mailbox(client, sent_folder or "Sent", role="sent")
            append_resp = await client.append(raw_bytes, _quote_imap_folder(target), flags="\\Seen")
            if not _imap_ok(append_resp) and "TRYCREATE" in _imap_response_detail(append_resp).upper():
                await _create_mailbox_if_missing(client, target)
                append_resp = await client.append(raw_bytes, _quote_imap_folder(target), flags="\\Seen")
            _require_imap_ok(append_resp, f"APPEND {target}")
            print(f"[SENT] Saved to '{target}' ok — from {email}")
            return target

        saved_target = await with_imap_retry(session, _append_sent)
        sent_saved = True
        sent_folder = saved_target
    except Exception as outer_ex:
        sent_error = str(outer_ex)
        print(f"[SENT] Failed to save sent copy: {sent_error}")

    return JSONResponse({"ok": True, "sentSaved": sent_saved, "sentFolder": sent_folder, "sentError": sent_error})


# ── Avatar ─────────────────────────────────────────────────────────────────────

@app.get("/api/avatar")
async def get_avatar(request: Request):
    await require_session(request)
    email = request.query_params.get("email", "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email.")

    gravatar_hash = hashlib.md5(email.encode()).hexdigest()
    gravatar_url = f"https://www.gravatar.com/avatar/{gravatar_hash}?s=128&d=identicon"

    # Try BIMI
    domain = email.split("@")[1].lower()
    bimi_url = None
    try:
        import dns.resolver
        resolver = dns.resolver.Resolver()
        resolver.timeout = 5
        answers = resolver.resolve(f"default._bimi.{domain}", "TXT")
        for rdata in answers:
            txt = "".join(v.decode("utf-8", errors="replace") if isinstance(v, bytes) else str(v) for v in rdata.strings)
            m = re.search(r"[;:]l\s*=\s*([^;]+)", txt, re.IGNORECASE)
            if m:
                url = m.group(1).strip().strip('"')
                if url.startswith("https://"):
                    bimi_url = url
                    break
    except Exception:
        pass

    response = JSONResponse({"bimiUrl": bimi_url, "gravatarUrl": gravatar_url})
    response.headers["Cache-Control"] = "private, max-age=3600"
    return response


# ── Signature ─────────────────────────────────────────────────────────────────

@app.get("/api/settings/signature")
async def get_signature(request: Request):
    session = await require_session(request)
    return JSONResponse({"settings": _read_signature(session["email"])})


@app.put("/api/settings/signature")
async def put_signature(request: Request, body: dict):
    session = await require_session(request)
    return JSONResponse({"settings": _write_signature(session["email"], body)})


def _read_signature(email: str) -> dict:
    key = hashlib.sha256(email.lower().encode()).hexdigest()
    path = f"{DATA_DIR}/signatures/{key}.json"
    defaults = {
        "displayName": "",
        "email": email,
        "organization": "",
        "replyTo": "",
        "bcc": "",
        "defaultEnabled": True,
        "html": "",
        "text": "",
    }
    try:
        with open(path) as f:
            data = json.load(f)
            defaults.update(data)
    except Exception:
        pass
    return defaults


def _write_signature(email: str, data: dict) -> dict:
    key = hashlib.sha256(email.lower().encode()).hexdigest()
    path = f"{DATA_DIR}/signatures/{key}.json"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    defaults = _read_signature(email)
    defaults.update({k: v for k, v in data.items() if k in defaults})
    defaults["email"] = email
    with open(path, "w") as f:
        json.dump(defaults, f, indent=2)
    return defaults


# ── DAV Config ────────────────────────────────────────────────────────────────

def _get_dav_config(session: dict) -> dict:
    """Build CalDAV/CardDAV server config from session + env vars."""
    email = session["email"]
    password = session["password"]
    domain = email.split("@")[1].lower()

    use_https = os.environ.get("DAV_SECURE", "true").lower() != "false"
    dav_port = os.environ.get("DAV_PORT", "2080")
    dav_host = os.environ.get("DAV_HOST", "").strip() or f"mail.{domain}"
    scheme = "https" if use_https else "http"
    server_url = f"{scheme}://{dav_host}:{dav_port}"

    return {
        "serverUrl": server_url,
        "username": email,
        "password": password,
    }


async def _dav_request(method: str, url: str, session: dict, body: str | None = None,
                       headers: dict | None = None) -> httpx.Response:
    """Make an authenticated WebDAV request."""
    config = _get_dav_config(session)
    auth = (config["username"], config["password"])
    hdrs = {"Content-Type": "application/xml; charset=utf-8"}
    if headers:
        hdrs.update(headers)

    async with httpx.AsyncClient(verify=False, timeout=30) as client:
        resp = await client.request(method, url, auth=auth, headers=hdrs, content=body)
    return resp


def _parse_ics_date(value: str, params: dict | None = None) -> tuple[str, bool]:
    """Parse ICS date/datetime value. Returns (iso_string, all_day)."""
    all_day = (params and params.get("VALUE") == "DATE") or ("T" not in value and len(value) == 8)

    if all_day and len(value) == 8:
        return f"{value[:4]}-{value[4:6]}-{value[6:8]}", True

    m = re.match(r"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$", value)
    if m:
        y, mo, d, h, mi, s = m.groups()
        is_utc = value.endswith("Z")
        iso = f"{y}-{mo}-{d}T{h}:{mi}:{s}{'Z' if is_utc else ''}"
        return iso, False

    return value, False


def _format_ics_date(iso_date: str, all_day: bool) -> str:
    """Format ISO date to ICS format."""
    if all_day:
        return iso_date.replace("-", "")[:8]
    try:
        dt = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
        return dt.strftime("%Y%m%dT%H%M%SZ")
    except Exception:
        return iso_date.replace("-", "").replace(":", "").replace("T", "")[:15] + "Z"


def _parse_ics(ics_text: str) -> dict:
    """Parse ICS text into event dict."""
    event = {}
    for line in ics_text.split("\n"):
        line = line.strip()
        colon_idx = line.find(":")
        if colon_idx == -1:
            continue
        key = line[:colon_idx]
        value = line[colon_idx + 1:].strip()

        parts = key.split(";")
        prop_name = parts[0]
        params = {}
        for p in parts[1:]:
            if "=" in p:
                pk, pv = p.split("=", 1)
                params[pk] = pv

        if prop_name == "UID":
            event["uid"] = value
        elif prop_name == "SUMMARY":
            event["summary"] = value
        elif prop_name == "DESCRIPTION":
            event["description"] = value.replace("\\n", "\n").replace("\\,", ",")
        elif prop_name == "LOCATION":
            event["location"] = value
        elif prop_name == "DTSTART":
            date_str, all_day = _parse_ics_date(value, params)
            event["dtstart"] = date_str
            event["allDay"] = all_day
        elif prop_name == "DTEND":
            date_str, _ = _parse_ics_date(value, params)
            event["dtend"] = date_str
        elif prop_name == "RRULE":
            event["recurrence"] = value

    return event


def _build_ics(event: dict, uid: str | None = None) -> str:
    """Build ICS string from event dict."""
    uid_str = uid or event.get("uid") or str(uuid.uuid4())
    now = _format_ics_date(datetime.utcnow().isoformat() + "Z", False)
    all_day = event.get("allDay", False)

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//BNIX Webmail//EN",
        "BEGIN:VEVENT",
        f"UID:{uid_str}",
        f"DTSTAMP:{now}",
    ]

    if event.get("dtstart"):
        prefix = "DTSTART;VALUE=DATE" if all_day else "DTSTART"
        lines.append(f"{prefix}:{_format_ics_date(event['dtstart'], all_day)}")
    if event.get("dtend"):
        prefix = "DTEND;VALUE=DATE" if all_day else "DTEND"
        lines.append(f"{prefix}:{_format_ics_date(event['dtend'], all_day)}")

    lines.append(f"SUMMARY:{event.get('summary', '')}")

    if event.get("description"):
        lines.append(f"DESCRIPTION:{event['description'].replace(chr(10), '\\n').replace(',', '\\,')}")
    if event.get("location"):
        lines.append(f"LOCATION:{event['location']}")
    if event.get("recurrence"):
        lines.append(f"RRULE:{event['recurrence']}")

    lines.extend(["END:VEVENT", "END:VCALENDAR"])
    return "\r\n".join(lines)


def _parse_vcard(vcard: str) -> dict:
    """Parse vCard string into contact dict."""
    contact = {}

    def get(key: str) -> str | None:
        m = re.search(rf"^{key}[;:](.+)$", vcard, re.MULTILINE | re.IGNORECASE)
        if m:
            return m.group(1).strip().replace("\\n", "\n").replace("\\,", ",")
        return None

    contact["fn"] = get("FN") or ""
    contact["email"] = get("EMAIL") or ""
    if not contact["email"]:
        m = re.search(r"^EMAIL[^:]*:(.+)$", vcard, re.MULTILINE | re.IGNORECASE)
        contact["email"] = m.group(1).strip() if m else ""

    contact["phone"] = get("TEL") or get("TEL;TYPE=CELL") or get("TEL;TYPE=WORK")
    org = get("ORG")
    contact["organization"] = org.replace(";", ", ") if org else None
    contact["title"] = get("TITLE")
    contact["note"] = get("NOTE")

    return contact


def _build_vcard(contact: dict, uid: str | None = None) -> str:
    """Build vCard 3.0 string from contact dict."""
    uid_str = uid or contact.get("email") or str(uuid.uuid4())
    fn = contact.get("fn", "")
    name_parts = fn.split(" ")

    lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        f"UID:{uid_str}",
        f"FN:{fn}",
        f"N:{';'.join(reversed(name_parts))};;;",
    ]

    if contact.get("email"):
        lines.append(f"EMAIL;TYPE=INTERNET:{contact['email']}")
    if contact.get("phone"):
        lines.append(f"TEL;TYPE=CELL:{contact['phone']}")
    if contact.get("organization"):
        lines.append(f"ORG:{contact['organization'].replace(',', '\\,')}")
    if contact.get("title"):
        lines.append(f"TITLE:{contact['title']}")
    if contact.get("note"):
        lines.append(f"NOTE:{contact['note'].replace(chr(10), '\\n')}")

    lines.append("END:VCARD")
    return "\r\n".join(lines)


def _xml_text(xml: str, tag: str) -> str | None:
    """Extract text content from an XML tag."""
    m = re.search(rf"<{tag}[^>]*>([^<]*)</{tag}>", xml, re.IGNORECASE)
    return m.group(1).strip() if m else None


# ── Calendar (CalDAV) ────────────────────────────────────────────────────────

@app.get("/api/calendar")
async def list_calendar_events(request: Request):
    session = await require_session(request)
    config = _get_dav_config(session)
    email = session["email"]
    start_str = request.query_params.get("start")
    end_str = request.query_params.get("end")

    calendar_url = f"{config['serverUrl']}/calendars/{email}/calendar/"

    # PROPFIND to list calendar objects
    propfind_body = """<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <D:getcontenttype/>
    <C:calendar-data/>
  </D:prop>
</D:propfind>"""

    try:
        resp = await _dav_request("PROPFIND", calendar_url, session, propfind_body,
                                  {"Depth": "1"})
        if resp.status_code not in (207, 200):
            # Try alternative URL patterns
            alt_urls = [
                f"{config['serverUrl']}/dav/calendars/{email}/calendar/",
                f"{config['serverUrl']}/.well-known/caldav",
            ]
            for alt_url in alt_urls:
                resp = await _dav_request("PROPFIND", alt_url, session, propfind_body,
                                          {"Depth": "1"})
                if resp.status_code in (207, 200):
                    calendar_url = alt_url
                    break
            else:
                return JSONResponse({"events": []})

        # Parse response XML for calendar-data
        xml_body = resp.text
        events = []

        # Split by response boundaries
        responses = re.split(r"<D:response>|<d:response>|<response>", xml_body, flags=re.IGNORECASE)
        for resp_block in responses[1:]:
            href_match = re.search(r"<D:href>([^<]+)</D:href>|<d:href>([^<]+)</d:href>|<href>([^<]+)</href>",
                                   resp_block, re.IGNORECASE)
            if not href_match:
                continue
            href = next(g for g in href_match.groups() if g is not None)

            # Extract calendar-data
            cal_data_match = re.search(
                r"<C:calendar-data[^>]*>([\s\S]*?)</C:calendar-data>|"
                r"<cal:calendar-data[^>]*>([\s\S]*?)</cal:calendar-data>|"
                r"<calendar-data[^>]*>([\s\S]*?)</calendar-data>",
                resp_block, re.IGNORECASE)
            if not cal_data_match:
                continue
            ics_data = next(g for g in cal_data_match.groups() if g is not None)
            # Unescape XML entities
            ics_data = ics_data.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&quot;", '"')

            etag_match = re.search(r"<D:getetag>([^<]+)</D:getetag>|<getetag>([^<]+)</getetag>",
                                   resp_block, re.IGNORECASE)
            etag = None
            if etag_match:
                etag = next(g for g in etag_match.groups() if g is not None)

            parsed = _parse_ics(ics_data)
            if not parsed.get("uid") or not parsed.get("dtstart"):
                continue

            # Time range filter
            if start_str and parsed["dtstart"] < start_str:
                continue
            if end_str and parsed["dtstart"] > end_str:
                continue

            events.append({
                "uid": parsed["uid"],
                "summary": parsed.get("summary", "(No title)"),
                "description": parsed.get("description"),
                "location": parsed.get("location"),
                "dtstart": parsed["dtstart"],
                "dtend": parsed.get("dtend", ""),
                "allDay": parsed.get("allDay", False),
                "recurrence": parsed.get("recurrence"),
                "etag": etag,
                "url": href,
            })

        events.sort(key=lambda e: e["dtstart"])
        return JSONResponse({"events": events})

    except Exception as e:
        return JSONResponse({"events": []})


@app.post("/api/calendar")
async def create_calendar_event(request: Request, body: dict):
    session = await require_session(request)
    config = _get_dav_config(session)
    email = session["email"]

    uid = str(uuid.uuid4())
    ics = _build_ics(body, uid)
    calendar_url = f"{config['serverUrl']}/calendars/{email}/calendar/"
    put_url = f"{calendar_url}{uid}.ics"

    try:
        resp = await _dav_request("PUT", put_url, session, ics,
                                  {"Content-Type": "text/calendar; charset=utf-8"})
        if resp.status_code in (200, 201, 204):
            return JSONResponse({
                "uid": uid,
                "summary": body.get("summary", ""),
                "description": body.get("description"),
                "location": body.get("location"),
                "dtstart": body.get("dtstart", ""),
                "dtend": body.get("dtend", ""),
                "allDay": body.get("allDay", False),
                "recurrence": body.get("recurrence"),
            })
        raise HTTPException(502, f"CalDAV create failed: {resp.status_code}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"CalDAV error: {e}")


@app.put("/api/calendar/{uid}")
async def update_calendar_event(request: Request, uid: str, body: dict):
    session = await require_session(request)
    config = _get_dav_config(session)
    email = session["email"]

    ics = _build_ics(body, uid)
    calendar_url = f"{config['serverUrl']}/calendars/{email}/calendar/"
    put_url = body.get("url") or f"{calendar_url}{uid}.ics"

    try:
        resp = await _dav_request("PUT", put_url, session, ics,
                                  {"Content-Type": "text/calendar; charset=utf-8"})
        if resp.status_code in (200, 201, 204):
            return JSONResponse({"ok": True})
        raise HTTPException(502, f"CalDAV update failed: {resp.status_code}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"CalDAV error: {e}")


@app.delete("/api/calendar/{uid}")
async def delete_calendar_event(request: Request, uid: str):
    session = await require_session(request)
    config = _get_dav_config(session)
    email = session["email"]

    # Try to find the event URL
    body = await request.body()
    url = None
    if body:
        try:
            data = json.loads(body)
            url = data.get("url")
        except Exception:
            pass

    if not url:
        calendar_url = f"{config['serverUrl']}/calendars/{email}/calendar/"
        url = f"{calendar_url}{uid}.ics"

    try:
        resp = await _dav_request("DELETE", url, session)
        if resp.status_code in (200, 204, 404):
            return JSONResponse({"ok": True})
        raise HTTPException(502, f"CalDAV delete failed: {resp.status_code}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"CalDAV error: {e}")


# ── Contacts (CardDAV) ───────────────────────────────────────────────────────

@app.get("/api/contacts")
async def list_contacts(request: Request):
    session = await require_session(request)
    config = _get_dav_config(session)
    email = session["email"]

    addressbook_url = f"{config['serverUrl']}/addressbooks/{email}/addressbook/"

    propfind_body = """<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <D:prop>
    <D:getetag/>
    <C:address-data/>
  </D:prop>
</D:propfind>"""

    try:
        resp = await _dav_request("PROPFIND", addressbook_url, session, propfind_body,
                                  {"Depth": "1"})
        if resp.status_code not in (207, 200):
            alt_urls = [
                f"{config['serverUrl']}/dav/addressbooks/{email}/addressbook/",
                f"{config['serverUrl']}/.well-known/carddav",
            ]
            for alt_url in alt_urls:
                resp = await _dav_request("PROPFIND", alt_url, session, propfind_body,
                                          {"Depth": "1"})
                if resp.status_code in (207, 200):
                    addressbook_url = alt_url
                    break
            else:
                return JSONResponse({"contacts": []})

        xml_body = resp.text
        contacts = []

        responses = re.split(r"<D:response>|<d:response>|<response>", xml_body, flags=re.IGNORECASE)
        for resp_block in responses[1:]:
            href_match = re.search(r"<D:href>([^<]+)</D:href>|<d:href>([^<]+)</d:href>|<href>([^<]+)</href>",
                                   resp_block, re.IGNORECASE)
            if not href_match:
                continue
            href = next(g for g in href_match.groups() if g is not None)

            vcard_match = re.search(
                r"<C:address-data[^>]*>([\s\S]*?)</C:address-data>|"
                r"<card:address-data[^>]*>([\s\S]*?)</card:address-data>|"
                r"<address-data[^>]*>([\s\S]*?)</address-data>",
                resp_block, re.IGNORECASE)
            if not vcard_match:
                continue
            vcard_data = next(g for g in vcard_match.groups() if g is not None)
            vcard_data = vcard_data.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&quot;", '"')

            etag_match = re.search(r"<D:getetag>([^<]+)</D:getetag>|<getetag>([^<]+)</getetag>",
                                   resp_block, re.IGNORECASE)
            etag = None
            if etag_match:
                etag = next(g for g in etag_match.groups() if g is not None)

            parsed = _parse_vcard(vcard_data)
            uid_from_url = href.rstrip("/").split("/")[-1].replace(".vcf", "") if href else ""

            contact = {
                "uid": parsed.get("email") or uid_from_url or "",
                "fn": parsed.get("fn") or "Unknown",
                "email": parsed.get("email") or "",
                "phone": parsed.get("phone"),
                "organization": parsed.get("organization"),
                "title": parsed.get("title"),
                "note": parsed.get("note"),
                "etag": etag,
                "url": href,
            }

            if contact["email"] or contact["fn"] != "Unknown":
                contacts.append(contact)

        contacts.sort(key=lambda c: c["fn"])
        return JSONResponse({"contacts": contacts})

    except Exception as e:
        return JSONResponse({"contacts": []})


@app.post("/api/contacts")
async def create_contact(request: Request, body: dict):
    session = await require_session(request)
    config = _get_dav_config(session)
    email = session["email"]

    uid = body.get("email") or str(uuid.uuid4())
    vcard = _build_vcard(body, uid)
    addressbook_url = f"{config['serverUrl']}/addressbooks/{email}/addressbook/"
    put_url = f"{addressbook_url}{uid}.vcf"

    try:
        resp = await _dav_request("PUT", put_url, session, vcard,
                                  {"Content-Type": "text/vcard; charset=utf-8"})
        if resp.status_code in (200, 201, 204):
            return JSONResponse({
                "uid": uid,
                "fn": body.get("fn", ""),
                "email": body.get("email", ""),
                "phone": body.get("phone"),
                "organization": body.get("organization"),
                "title": body.get("title"),
                "note": body.get("note"),
            })
        raise HTTPException(502, f"CardDAV create failed: {resp.status_code}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"CardDAV error: {e}")


@app.put("/api/contacts/{uid}")
async def update_contact(request: Request, uid: str, body: dict):
    session = await require_session(request)
    config = _get_dav_config(session)
    email = session["email"]

    vcard = _build_vcard(body, uid)
    addressbook_url = f"{config['serverUrl']}/addressbooks/{email}/addressbook/"
    put_url = body.get("url") or f"{addressbook_url}{uid}.vcf"

    try:
        headers = {"Content-Type": "text/vcard; charset=utf-8"}
        if body.get("etag"):
            headers["If-Match"] = body["etag"]

        resp = await _dav_request("PUT", put_url, session, vcard, headers)
        if resp.status_code in (200, 201, 204):
            return JSONResponse({"ok": True})
        raise HTTPException(502, f"CardDAV update failed: {resp.status_code}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"CardDAV error: {e}")


@app.delete("/api/contacts/{uid}")
async def delete_contact(request: Request, uid: str):
    session = await require_session(request)
    config = _get_dav_config(session)
    email = session["email"]

    body = await request.body()
    url = None
    if body:
        try:
            data = json.loads(body)
            url = data.get("url")
        except Exception:
            pass

    if not url:
        addressbook_url = f"{config['serverUrl']}/addressbooks/{email}/addressbook/"
        url = f"{addressbook_url}{uid}.vcf"

    try:
        headers = {}
        if body:
            try:
                data = json.loads(body)
                if data.get("etag"):
                    headers["If-Match"] = data["etag"]
            except Exception:
                pass

        resp = await _dav_request("DELETE", url, session, headers=headers)
        if resp.status_code in (200, 204, 404):
            return JSONResponse({"ok": True})
        raise HTTPException(502, f"CardDAV delete failed: {resp.status_code}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"CardDAV error: {e}")


# ─── Static Files & SPA ──────────────────────────────────────────────────────

# Mount static assets (CSS, JS, images)
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="static-assets")
    app.mount("/brand", StaticFiles(directory=str(STATIC_DIR / "brand")), name="static-brand")


@app.get("/")
async def serve_index():
    """Serve the main SPA page."""
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return HTMLResponse("<h1>BNIX Webmail</h1><p>Static files not found. Run build first.</p>")


@app.get("/favicon.png")
async def serve_favicon():
    """Serve favicon."""
    fav = STATIC_DIR / "brand" / "bnix-favicon.png"
    if fav.exists():
        return FileResponse(str(fav), media_type="image/png")
    raise HTTPException(404)


# ─── Startup ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    asyncio.create_task(_pool_cleanup_loop())


async def _pool_cleanup_loop():
    while True:
        await asyncio.sleep(60)
        await _evict_pool()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port, log_level="info")
