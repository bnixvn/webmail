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
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from email.parser import Parser as EmailParser
from email.policy import default as email_default
from functools import partial
from pathlib import Path
from typing import Any, AsyncIterator

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
                try:
                    await client.noop()
                    _pool[email] = (client, now)
                    return client
                except Exception:
                    pass
            try:
                await client.logout()
            except Exception:
                pass
            del _pool[email]

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


async def _evict_pool():
    """Periodic cleanup of stale IMAP connections."""
    async with _pool_lock:
        now = time.time()
        for email in list(_pool.keys()):
            client, last_used = _pool[email]
            if now - last_used > POOL_TTL:
                try:
                    await client.logout()
                except Exception:
                    pass
                del _pool[email]


async def _get_imap_for_session(session: dict) -> aioimaplib.IMAP4_SSL:
    """Resolve IMAP config for a session."""
    email = session["email"]
    domain = email.split("@")[1].lower()
    imap_host = session.get("imap_host") or os.environ.get("IMAP_HOST", "").strip() or await _discover_mail_host(domain, "imap")
    imap_port = int(session.get("imap_port") or os.environ.get("IMAP_PORT", "993"))
    return await _get_pooled_imap(email, session["password"], imap_host, imap_port)


async def _discover_mail_host(domain: str, service: str = "imap") -> str:
    """Auto-discover mail server via MX record."""
    try:
        import dns.resolver
        resolver = dns.resolver.Resolver()
        resolver.timeout = 5
        answers = resolver.resolve(domain, "MX")
        records = sorted([(r.preference, str(r.exchange).rstrip(".")) for r in answers])
        if records:
            return records[0][1]
    except Exception:
        pass
    return f"mail.{domain}"


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

        def _scope_selector(sels: str) -> str:
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

        def _walk_payload(msg):
            content_type = msg.get_content_type()
            disp = msg.get_content_disposition()
            if disp and disp.lower() in ("attachment", "inline"):
                filename = msg.get_filename()
                if not filename:
                    name = msg.get_param("name", header="content-type")
                    if name:
                        filename = name
                attachments.append({
                    "filename": filename,
                    "contentType": msg.get_content_type(),
                    "size": len(msg.get_payload(decode=True) or b""),
                    "cid": msg.get("content-id", "").strip("<>") or None,
                })
            elif content_type == "text/plain":
                payload = msg.get_payload(decode=True)
                if payload:
                    text_parts.append(payload.decode(msg.get_content_charset() or "utf-8", errors="replace"))
            elif content_type == "text/html":
                payload = msg.get_payload(decode=True)
                if payload:
                    html_parts.append(payload.decode(msg.get_content_charset() or "utf-8", errors="replace"))

        if msg.is_multipart():
            for part in msg.walk():
                _walk_payload(part)
        else:
            _walk_payload(msg)

        return {
            "text": "\n".join(text_parts) or None,
            "html": html_parts[0] if html_parts else None,
            "attachments": attachments,
        }

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _parse)


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
    client = await _get_imap_for_session(session)

    # List with status — aioimaplib.list() requires (reference, pattern)
    _, folders = await client.list("", "*")
    mailboxes = []
    for line in folders:
        if not line:
            continue
        # aioimaplib stores: b'(\\HasNoChildren) "/" "INBOX"' (no LIST prefix)
        parts = line.split()
        flags = []
        delim = "/"
        name = ""
        in_flags = False
        for part in parts:
            if part.startswith(b"("):
                in_flags = True
                flags_str = part.decode()
                # Handle single-token flags like (\HasNoChildren)
                if flags_str.endswith(")"):
                    flags_str = flags_str[1:-1]
                    in_flags = False
                else:
                    flags_str = flags_str[1:]
                flags.extend(flags_str.split())
            elif in_flags:
                if part.endswith(b")"):
                    flags.extend(part.decode()[:-1].split())
                    in_flags = False
                else:
                    flags.extend(part.decode().split())
            elif part == b"\"\"":
                delim = "/"
            elif part.startswith(b"\"") and not name:
                name = part.decode().strip('"')
            elif not name and not part.startswith(b"\\"):
                name = part.decode()

        path = name
        special_use = None
        if "\\Sent" in flags:
            special_use = "\\Sent"
        elif "\\Trash" in flags:
            special_use = "\\Trash"
        elif "\\Drafts" in flags:
            special_use = "\\Drafts"
        elif "\\Junk" in flags:
            special_use = "\\Junk"

        # Get status
        try:
            _, status_data = await client.status(name, "(MESSAGES UNSEEN)")
            status_str = status_data[0].decode() if status_data else ""
            msgs = int(re.search(r"MESSAGES\s+(\d+)", status_str).group(1)) if re.search(r"MESSAGES\s+(\d+)", status_str) else 0
            unseen = int(re.search(r"UNSEEN\s+(\d+)", status_str).group(1)) if re.search(r"UNSEEN\s+(\d+)", status_str) else 0
        except Exception:
            msgs, unseen = 0, 0

        mailboxes.append({
            "path": path,
            "name": path,
            "delimiter": delim,
            "specialUse": special_use,
            "total": msgs,
            "unseen": unseen,
            "depth": 0,
        })

    return JSONResponse({"mailboxes": mailboxes})


@app.post("/api/mailboxes")
async def create_mailbox(request: Request, body: dict):
    session = await require_session(request)
    path = (body.get("path") or "").strip()
    if not path:
        raise HTTPException(400, "Path is required.")
    client = await _get_imap_for_session(session)
    await client.create(path)
    return JSONResponse({"ok": True, "path": path}, status_code=201)


# ── Messages ──────────────────────────────────────────────────────────────────

@app.get("/api/messages")
async def list_messages(request: Request):
    session = await require_session(request)
    folder = request.query_params.get("folder", "INBOX")
    limit = int(request.query_params.get("limit", "40"))

    client = await _get_imap_for_session(session)
    await client.select(folder)

    # Get total message count
    _, status_data = await client.status(folder, "(MESSAGES)")
    total = 0
    if status_data:
        m = re.search(r"MESSAGES\s+(\d+)", status_data[0].decode())
        total = int(m.group(1)) if m else 0

    if total == 0:
        return JSONResponse({"messages": []})

    # Fetch last N messages with envelope + snippet
    start_uid = max(1, total - min(limit, 100) + 1)
    _, messages_data = await client.fetch(
        f"{start_uid}:*",
        "(UID ENVELOPE FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO DATE)])",
    )

    messages = []
    for uid_str, msg_data in _chunk_messages(messages_data):
        try:
            raw = msg_data if isinstance(msg_data, bytes) else b""
            parsed = EmailParser(policy=email_default).parsebytes(raw)
            subject = parsed.get("Subject", "(No subject)")
            from_header = parsed.get("From", "")
            to_header = parsed.get("To", "")
            date_str = parsed.get("Date", "")
            snippet = _clean_snippet(parsed.get_body("plain") or parsed.get_body("html") or "")
            raw_flags = parsed.get("Flags", "").split()
            seen = "Seen" in raw_flags or "\\Seen" in raw_flags
            flagged = "Flagged" in raw_flags or "\\Flagged" in raw_flags

            uid_match = re.search(r"UID\s+(\d+)", uid_str)
            uid = int(uid_match.group(1)) if uid_match else 0

            messages.append({
                "uid": uid,
                "subject": subject,
                "from": [{"address": from_header}],
                "to": [{"address": to_header}],
                "date": _iso_date(date_str) if date_str else None,
                "flags": raw_flags,
                "seen": seen,
                "flagged": flagged,
                "snippet": snippet,
            })
        except Exception:
            pass

    messages.sort(key=lambda m: m["uid"], reverse=True)
    return JSONResponse({"messages": messages[:limit]})


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


@app.get("/api/messages/{uid}")
async def get_message(request: Request, uid: int):
    session = await require_session(request)
    folder = request.query_params.get("folder", "INBOX")

    client = await _get_imap_for_session(session)
    await client.select(folder)

    FETCH_TIMEOUT = 60.0

    # Step 1: Fetch envelope + flags (fast, no source)
    summary = None
    deadline = time.time() + FETCH_TIMEOUT

    try:
        _, fetch_data = await asyncio.wait_for(
            client.fetch(str(uid), "(UID ENVELOPE FLAGS INTERNALDATE)"),
            timeout=deadline - time.time(),
        )

        for uid_str, msg_data in (list(fetch_data.items()) if isinstance(fetch_data, dict) else []):
            flags = _flags_array(getattr(msg_data, "flags", []) or [])
            envelope = getattr(msg_data, "envelope", None) or {}
            summary = {
                "uid": int(getattr(msg_data, "uid", uid)),
                "messageId": envelope.get("message_id", None),
                "subject": envelope.get("subject", "(No subject)") or "(No subject)",
                "from": _addresses(envelope.get("from", [])),
                "to": _addresses(envelope.get("to", [])),
                "cc": _addresses(envelope.get("cc", [])),
                "bcc": _addresses(envelope.get("bcc", [])),
                "date": _iso_date(envelope.get("date")),
                "flags": flags,
                "seen": "\\Seen" in flags,
                "flagged": "\\Flagged" in flags,
                "snippet": "",
                "html": None,
                "text": None,
                "attachments": [],
            }

            # Mark as seen
            if "\\Seen" not in flags:
                asyncio.create_task(client.store(str(uid), "+FLAGS", "\\Seen"))

        if not summary:
            raise HTTPException(404, "Message not found.")

    except asyncio.TimeoutError:
        raise HTTPException(504, "Message fetch timed out.")

    # Step 2: Fetch full source with timeout
    try:
        source = None
        deadline2 = time.time() + FETCH_TIMEOUT

        async def _fetch_source():
            _, src_data = await client.fetch(str(uid), "BODY[]")
            if isinstance(src_data, dict):
                for _, v in src_data.items():
                    if isinstance(v, bytes):
                        return v
            elif isinstance(src_data, (list, tuple)):
                for item in src_data:
                    if isinstance(item, bytes):
                        return item
            return None

        source = await asyncio.wait_for(_fetch_source(), timeout=deadline2 - time.time())

        if source:
            parsed = await _async_parse_email(source)
            summary["snippet"] = _clean_snippet(parsed.get("text", ""))
            html = parsed.get("html")
            summary["html"] = _sanitize_html(html) if html else None
            summary["text"] = parsed.get("text")
            summary["attachments"] = parsed.get("attachments", [])

    except asyncio.TimeoutError:
        # Return what we have (envelope) even on timeout
        pass

    return JSONResponse({"message": summary})


@app.patch("/api/messages/{uid}/flags")
async def update_flags(request: Request, uid: int, body: dict):
    session = await require_session(request)
    folder = body.get("folder", "INBOX")
    flag = body.get("flag", "\\Seen")
    enabled = bool(body.get("enabled", True))

    client = await _get_imap_for_session(session)
    await client.select(folder)

    cmd = "+FLAGS" if enabled else "-FLAGS"
    await client.store(str(uid), cmd, flag)
    return JSONResponse({"ok": True})


@app.post("/api/messages/{uid}/move")
async def move_message(request: Request, uid: int, body: dict):
    session = await require_session(request)
    folder = body.get("folder", "INBOX")
    destination = body.get("destination", "Trash")

    client = await _get_imap_for_session(session)
    await client.select(folder)
    await client.copy(str(uid), destination)
    await client.store(str(uid), "+FLAGS", "\\Deleted")
    await client.expunge()
    return JSONResponse({"ok": True})


@app.delete("/api/messages/{uid}")
async def delete_message(request: Request, uid: int):
    session = await require_session(request)
    folder = request.query_params.get("folder", "INBOX")

    client = await _get_imap_for_session(session)
    await client.select(folder)
    await client.store(str(uid), "+FLAGS", "\\Deleted")
    await client.expunge()
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

    # Build raw email
    lines = []
    from_header = from_name and f'"{from_name}" <{email}>' or email
    lines.append(f"From: {from_header}")
    lines.append(f"To: {', '.join(to_recipients)}")
    if cc_recipients:
        lines.append(f"Cc: {', '.join(cc_recipients)}")
    lines.append(f"Subject: {subject}")
    if reply_to:
        lines.append(f"Reply-To: {reply_to}")
    lines.append("MIME-Version: 1.0")
    if html:
        boundary = "----=_Part_=_" + str(int(time.time() * 1000))
        lines.append(f"Content-Type: multipart/alternative; boundary={boundary}")
        lines.append("")
        lines.append(f"--{boundary}")
        lines.append("Content-Type: text/plain; charset=utf-8")
        lines.append("")
        lines.append(text or "")
        lines.append(f"--{boundary}")
        lines.append("Content-Type: text/html; charset=utf-8")
        lines.append("")
        lines.append(html)
        lines.append(f"--{boundary}--")
    else:
        lines.append("Content-Type: text/plain; charset=utf-8")
        lines.append("")
        lines.append(text or "")

    raw_email = "\r\n".join(lines).encode("utf-8")

    # Send via SMTP
    domain = email.split("@")[1].lower()
    smtp_host = session.get("smtp_host") or os.environ.get("SMTP_HOST", "").strip() or await _discover_mail_host(domain, "smtp")
    smtp_port = int(session.get("smtp_port") or os.environ.get("SMTP_PORT", "465"))
    smtp_secure = os.environ.get("SMTP_SECURE", "true").lower() != "false"

    import aiosmtplib

    smtp = aiosmtplib.SMTP(
        hostname=smtp_host,
        port=smtp_port,
        use_tls=smtp_secure,
        timeout=SMTP_TIMEOUT,
    )
    try:
        await smtp.connect()
        await smtp.login(email, password)
        await smtp.send_message(
            email.message_from_bytes(raw_email),
            from_addr=email,
            to_addrs=to_recipients + cc_recipients + bcc_recipients,
        )
        await smtp.quit()
    except Exception as e:
        raise HTTPException(502, f"SMTP error: {e}")

    return JSONResponse({"ok": True})


# ── Avatar ─────────────────────────────────────────────────────────────────────

@app.get("/api/avatar")
async def get_avatar(request: Request):
    await require_session(request)
    email = request.query_params.get("email", "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email.")

    gravatar_hash = hashlib.md5(email.encode()).hexdigest()
    gravatar_url = f"https://www.gravatar.com/avatar/{gravatar_hash}?s=128&d=404"

    # Try BIMI
    domain = email.split("@")[1].lower()
    bimi_url = None
    try:
        import dns.resolver
        resolver = dns.resolver.Resolver()
        resolver.timeout = 5
        answers = resolver.resolve(f"default._bimi.{domain}", "TXT")
        for rdata in answers:
            txt = "".join(str(v) for v in rdata.strings)
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
