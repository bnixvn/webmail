import asyncio
import base64
import hashlib
import hmac
import json
import os
import tempfile
import time
import unittest
from unittest.mock import patch

from fastapi import HTTPException

_DATA_DIR = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _DATA_DIR
os.environ["AUTH_SECRET"] = "test-auth-secret-for-sso-000000000001"

from backend import main  # noqa: E402

SECRET = "panel-shared-secret"


def _token(email="a@example.com", exp=None, nonce="n1", secret=SECRET, tamper=False):
    payload = json.dumps({"email": email, "exp": exp or int(time.time()) + 60, "nonce": nonce}).encode()
    body = base64.urlsafe_b64encode(payload).rstrip(b"=").decode()
    sig = base64.urlsafe_b64encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    if tamper:
        body = base64.urlsafe_b64encode(payload.replace(b"a@", b"b@")).rstrip(b"=").decode()
    return f"{body}.{sig}"


class SsoTests(unittest.TestCase):
    def setUp(self):
        import sqlite3

        with sqlite3.connect(main.SESSIONS_DB) as db:
            db.execute("DELETE FROM used_sso_tokens")
            db.commit()
        self.patches = [
            patch.object(main, "SSO_SECRET", SECRET),
            patch.object(main, "SSO_MASTER_USER", "bpanel-webmail"),
            patch.object(main, "SSO_MASTER_PASSWORD", "master-pass"),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in self.patches:
            item.stop()

    def test_a_good_token_names_its_mailbox_once(self):
        token = _token(email="A@Example.com")
        self.assertEqual(main._verify_sso_token(token), "a@example.com")
        with self.assertRaises(HTTPException):
            main._verify_sso_token(token)

    def test_a_forged_expired_or_far_future_token_is_refused(self):
        for token in (
            _token(secret="wrong"),
            _token(tamper=True),
            _token(exp=int(time.time()) - 1, nonce="n2"),
            _token(exp=int(time.time()) + 3600, nonce="n3"),
            "garbage",
            "",
        ):
            with self.assertRaises(HTTPException):
                main._verify_sso_token(token)

    def test_an_sso_session_logs_in_as_the_master_user_without_a_stored_password(self):
        session = {"email": "a@example.com", "auth_type": "sso"}
        self.assertEqual(main._session_login_credentials(session),
                         ("a@example.com*bpanel-webmail", "master-pass"))
        self.assertNotIn("password", session)

    def test_a_password_session_is_unchanged(self):
        session = {"email": "a@example.com", "login_email": "a@example.com", "password": "pw"}
        self.assertEqual(main._session_login_credentials(session), ("a@example.com", "pw"))

    def test_sso_off_means_no_endpoint_and_no_sso_sessions(self):
        with patch.object(main, "SSO_SECRET", ""):
            self.assertFalse(main._sso_enabled())
            with self.assertRaises(main.SessionExpiredError):
                main._session_login_credentials({"email": "a@example.com", "auth_type": "sso"})
            from starlette.requests import Request

            request = Request({"type": "http", "method": "GET", "path": "/api/auth/sso", "headers": [],
                               "client": ("203.0.113.9", 1), "query_string": b""})
            with self.assertRaises(HTTPException) as refused:
                asyncio.run(main.sso_login(request, token=_token()))
            self.assertEqual(refused.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
