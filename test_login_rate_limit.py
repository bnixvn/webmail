import asyncio
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request


_DATA_DIR = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _DATA_DIR
os.environ["AUTH_SECRET"] = "test-auth-secret-for-login-rate-limit-0001"

from backend import main


class LoginRateLimitTests(unittest.TestCase):
    def setUp(self):
        import sqlite3
        import hashlib

        with sqlite3.connect(main.ADMIN_DB) as db:
            db.execute("DELETE FROM login_attempts")
            db.execute("DELETE FROM admin_users")
            now = "2026-01-01T00:00:00"
            db.execute(
                "INSERT INTO admin_users (username, password, created_at, updated_at) VALUES (?,?,?,?)",
                ("admin", hashlib.sha256("admin123".encode()).hexdigest(), now, now),
            )
            db.commit()

    def test_blocks_on_max_attempts_and_expires(self):
        with (
            patch.object(main, "LOGIN_MAX_ATTEMPTS", 3),
            patch.object(main, "LOGIN_ATTEMPT_WINDOW", 60),
            patch.object(main, "LOGIN_BLOCK_SECONDS", 120),
        ):
            self.assertEqual(main._record_login_failure("webmail", "203.0.113.10", 1000), (2, 0))
            self.assertEqual(main._record_login_failure("webmail", "203.0.113.10", 1010), (1, 0))
            self.assertEqual(main._record_login_failure("webmail", "203.0.113.10", 1020), (0, 120))
            self.assertEqual(main._login_block_remaining("webmail", "203.0.113.10", 1030), 110)
            self.assertEqual(main._login_block_remaining("webmail", "203.0.113.10", 1140), 0)

    def test_window_and_success_reset_attempts(self):
        with (
            patch.object(main, "LOGIN_MAX_ATTEMPTS", 3),
            patch.object(main, "LOGIN_ATTEMPT_WINDOW", 60),
            patch.object(main, "LOGIN_BLOCK_SECONDS", 120),
        ):
            self.assertEqual(main._record_login_failure("webmail", "203.0.113.11", 1000), (2, 0))
            self.assertEqual(main._record_login_failure("webmail", "203.0.113.11", 1060), (2, 0))
            main._reset_login_failures("webmail", "203.0.113.11")
            self.assertEqual(main._record_login_failure("webmail", "203.0.113.11", 1070), (2, 0))

    def test_scopes_are_independent(self):
        with patch.object(main, "LOGIN_MAX_ATTEMPTS", 3):
            self.assertEqual(main._record_login_failure("webmail", "203.0.113.12", 1000), (2, 0))
            self.assertEqual(main._record_login_failure("admin", "203.0.113.12", 1000), (2, 0))

    def test_trusts_forwarded_ip_only_from_loopback_proxy(self):
        proxied = Request({
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": [(b"x-forwarded-for", b"198.51.100.99, 203.0.113.20")],
            "client": ("127.0.0.1", 12345),
        })
        direct = Request({
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": [(b"x-forwarded-for", b"203.0.113.21")],
            "client": ("198.51.100.10", 12345),
        })

        self.assertEqual(main._login_client_ip(proxied), "203.0.113.20")
        self.assertEqual(main._login_client_ip(direct), "198.51.100.10")

    def test_admin_login_returns_lock_message_on_tenth_failure(self):
        request = Request({
            "type": "http",
            "method": "POST",
            "path": "/api/admin/login",
            "headers": [(b"x-forwarded-for", b"203.0.113.30")],
            "client": ("127.0.0.1", 12345),
        })

        with (
            patch.object(main, "LOGIN_MAX_ATTEMPTS", 10),
            patch.object(main, "LOGIN_ATTEMPT_WINDOW", 600),
            patch.object(main, "LOGIN_BLOCK_SECONDS", 900),
        ):
            for remaining in range(9, 0, -1):
                with self.assertRaises(HTTPException) as raised:
                    asyncio.run(main.admin_login(
                        request, {"username": "admin", "password": "wrong"}
                    ))
                self.assertEqual(raised.exception.status_code, 401)
                self.assertEqual(
                    raised.exception.headers["X-RateLimit-Remaining"], str(remaining)
                )
                self.assertEqual(
                    raised.exception.detail["remainingAttempts"], remaining
                )

            with self.assertRaises(HTTPException) as raised:
                asyncio.run(main.admin_login(
                    request, {"username": "admin", "password": "wrong"}
                ))
            self.assertEqual(raised.exception.status_code, 429)
            self.assertGreater(int(raised.exception.headers["Retry-After"]), 0)
            self.assertEqual(
                raised.exception.detail["code"], "LOGIN_TEMPORARILY_LOCKED"
            )
            self.assertIn("temporarily locked", raised.exception.detail["message"])

    def test_successful_admin_login_resets_failures(self):
        request = Request({
            "type": "http",
            "method": "POST",
            "path": "/api/admin/login",
            "headers": [(b"x-forwarded-for", b"203.0.113.31")],
            "client": ("127.0.0.1", 12345),
        })

        with self.assertRaises(HTTPException):
            asyncio.run(main.admin_login(
                request, {"username": "admin", "password": "wrong"}
            ))

        response = asyncio.run(main.admin_login(
            request, {"username": "admin", "password": "admin123"}
        ))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            main._login_block_remaining("admin", "203.0.113.31"), 0
        )


if __name__ == "__main__":
    unittest.main()
