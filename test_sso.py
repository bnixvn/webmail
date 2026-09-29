import asyncio
import base64
import hashlib
import hmac
import json
import os
import secrets
import tempfile
import time
import unittest
from unittest.mock import AsyncMock, patch

from starlette.requests import Request

_DATA_DIR = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _DATA_DIR
os.environ["AUTH_SECRET"] = "test-auth-secret-for-sso-0000000000001"

from backend import main

SECRET = "s" * 48
SSO_ENV = {
    "SSO_SECRET": SECRET,
    "SSO_MASTER_USER": "opanel-sso",
    "SSO_MASTER_PASSWORD": "master-pass",
    "IMAP_HOST": "127.0.0.1",
    "SMTP_HOST": "127.0.0.1",
}


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _token(email="alice@example.com", ttl=60, nonce=None, secret=SECRET) -> str:
    payload = _b64(json.dumps({"email": email, "exp": int(time.time()) + ttl,
                               "nonce": nonce or secrets.token_urlsafe(16)}).encode())
    signature = _b64(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def _request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/sso", "headers": [],
                    "client": ("127.0.0.1", 12345), "query_string": b""})


class _Imap:
    def __init__(self, ok=True):
        self.logins = []
        self.ok = ok

    async def wait_hello_from_server(self):
        return None

    async def login(self, user, password):
        self.logins.append((user, password))
        return type("R", (), {"result": "OK" if self.ok else "NO", "lines": []})()

    async def logout(self):
        return None


class SsoTests(unittest.TestCase):
    def _run(self, token, imap=None, env=SSO_ENV):
        imap = imap or _Imap()
        with patch.dict(os.environ, env, clear=False), \
                patch.object(main, "_new_imap_client", return_value=imap), \
                patch.object(main, "_imap_ok", side_effect=lambda r: r.result == "OK"), \
                patch.object(main, "_resolve_imap_config", AsyncMock(return_value=("127.0.0.1", 143, False))), \
                patch.object(main, "_resolve_smtp_config", AsyncMock(return_value=("127.0.0.1", 587))):
            return asyncio.run(main.sso_login(_request(), token)), imap

    def test_off_unless_configured(self):
        with patch.dict(os.environ, {"SSO_SECRET": "", "SSO_MASTER_USER": "", "SSO_MASTER_PASSWORD": ""}):
            response = asyncio.run(main.sso_login(_request(), _token()))
        self.assertEqual(response.status_code, 404)

    def test_a_signed_link_opens_the_mailbox_as_the_master_user(self):
        response, imap = self._run(_token())
        self.assertEqual(response.status_code, 303)
        self.assertEqual(imap.logins, [("alice@example.com*opanel-sso", "master-pass")])
        cookie = response.headers["set-cookie"]
        value = cookie.split(main.SESSION_COOKIE + "=", 1)[1].split(";", 1)[0]
        with patch.dict(os.environ, SSO_ENV):
            session = main.decrypt_session(value)
        self.assertEqual(session["auth_type"], "sso")
        self.assertEqual(session["email"], "alice@example.com")
        self.assertNotIn("password", session)  # never in the cookie

    def test_a_link_works_once(self):
        token = _token()
        self.assertEqual(self._run(token)[0].status_code, 303)
        self.assertEqual(self._run(token)[0].status_code, 403)

    def test_expired_forged_and_long_lived_links_are_refused(self):
        for token in (_token(ttl=-5), _token(secret="x" * 48), _token(ttl=3600), "garbage", ""):
            response, imap = self._run(token)
            self.assertEqual(response.status_code, 403, token)
            self.assertEqual(imap.logins, [])

    def test_a_mailbox_that_will_not_open_gets_no_session(self):
        response, _ = self._run(_token(), imap=_Imap(ok=False))
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("set-cookie", response.headers)

    def test_password_sessions_are_unchanged(self):
        session = {"email": "bob@example.com", "login_email": "bob@example.com", "password": "pw"}
        self.assertEqual(main._session_credentials(session), ("bob@example.com", "pw"))

    def test_an_sso_session_dies_with_the_sso_configuration(self):
        session = {"email": "a@example.com", "auth_type": "sso", "sid": "x",
                   "createdAt": int(time.time() * 1000)}
        with patch.dict(os.environ, SSO_ENV):
            token = main.encrypt_session(session)
            self.assertIsNotNone(main.decrypt_session(token))
        with patch.dict(os.environ, {"SSO_SECRET": ""}):
            self.assertIsNone(main.decrypt_session(token))

    def test_smtp_uses_the_master_user_too(self):
        smtp = AsyncMock()
        session = {"email": "a@example.com", "auth_type": "sso"}
        with patch.dict(os.environ, SSO_ENV):
            asyncio.run(main._smtp_login_for_session(smtp, session, "a@example.com"))
        smtp.login.assert_awaited_once_with("a@example.com*opanel-sso", "master-pass")


if __name__ == "__main__":
    unittest.main()
