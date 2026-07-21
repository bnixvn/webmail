import asyncio
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from starlette.requests import Request


_DATA_DIR = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _DATA_DIR
os.environ["AUTH_SECRET"] = "test-auth-secret-for-security-hardening-0001"

from backend import main


def _request() -> Request:
    return Request({
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": [],
        "client": ("127.0.0.1", 12345),
    })


class SecurityHardeningTests(unittest.TestCase):
    def setUp(self):
        self._env_patches = []

    def tearDown(self):
        for patcher in reversed(self._env_patches):
            patcher.stop()

    def _patch_env(self, values: dict[str, str]):
        patcher = patch.dict(os.environ, values, clear=False)
        patcher.start()
        self._env_patches.append(patcher)

    def test_import_fails_without_private_auth_secret(self):
        env = os.environ.copy()
        env.pop("AUTH_SECRET", None)
        env["DATA_DIR"] = tempfile.mkdtemp()
        proc = subprocess.run(
            [sys.executable, "-c", "import backend.main"],
            cwd=Path(__file__).resolve().parent,
            env=env,
            capture_output=True,
            text=True,
            timeout=15,
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("AUTH_SECRET must be set", proc.stderr + proc.stdout)

    def test_public_fallback_auth_secret_is_rejected(self):
        with patch.dict(os.environ, {
            "AUTH_SECRET": "An_elNMjOgQouJJCOgPFcChGXNEnXgbDv3E0cQQ6WQM",
        }):
            with self.assertRaises(RuntimeError):
                main._required_auth_secret()

    def test_admin_init_does_not_seed_default_admin(self):
        import sqlite3

        with sqlite3.connect(main.ADMIN_DB) as db:
            db.execute("DELETE FROM admin_users")
            db.commit()
        main._admin_init()
        with sqlite3.connect(main.ADMIN_DB) as db:
            row = db.execute("SELECT COUNT(*) FROM admin_users").fetchone()
        self.assertEqual(row[0], 0)

    def test_caddy_automation_disabled_by_default_and_when_root(self):
        with patch.object(main, "CADDY_AUTOMATION_ENABLED", False):
            self.assertFalse(main._caddy_automation_allowed())
        with (
            patch.object(main, "CADDY_AUTOMATION_ENABLED", True),
            patch.object(main.os, "geteuid", return_value=0, create=True),
        ):
            self.assertFalse(main._caddy_automation_allowed())

    def test_caddy_alias_renderer_uses_separate_site_blocks(self):
        rendered = main._render_caddy_aliases(["webmail.one.example", "webmail.two.example"])
        self.assertIn("webmail.one.example {\n    reverse_proxy 127.0.0.1:8000\n}", rendered)
        self.assertIn("webmail.two.example {\n    reverse_proxy 127.0.0.1:8000\n}", rendered)
        self.assertNotIn("import /etc/caddy/Caddyfile", rendered)

    def test_caddy_alias_default_path_is_dedicated_fragment(self):
        self.assertEqual(main.CADDY_ALIASES_PATH, "/etc/caddy/bnix-webmail.conf")

    def test_caddy_alias_writer_writes_only_configured_include(self):
        include_path = Path(tempfile.mkdtemp()) / "aliases.caddy"
        with patch.object(main, "CADDY_ALIASES_PATH", str(include_path)):
            self.assertTrue(main._write_caddy_aliases(["webmail.safe.example"]))
        self.assertIn("webmail.safe.example", include_path.read_text(encoding="utf-8"))

    def test_login_ignores_client_supplied_mail_server_overrides(self):
        self._patch_env({
            "IMAP_HOST": "imap.safe.example",
            "IMAP_PORT": "993",
            "SMTP_HOST": "smtp.safe.example",
            "SMTP_PORT": "465",
        })
        captured = {}

        class FakeIMAP:
            def __init__(self, host, port, timeout):
                captured["imap_host"] = host
                captured["imap_port"] = port

            async def wait_hello_from_server(self):
                return None

            async def login(self, email, password):
                captured["login_email"] = email
                return None

            async def logout(self):
                return None

        with patch.object(main.aioimaplib, "IMAP4_SSL", FakeIMAP):
            response = asyncio.run(main.login(_request(), {
                "email": "user@example.com",
                "password": "correct-password",
                "imapHost": "127.0.0.1",
                "imapPort": "1143",
                "smtpHost": "169.254.169.254",
                "smtpPort": "25",
            }))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured["imap_host"], "imap.safe.example")
        self.assertEqual(captured["imap_port"], 993)
        cookie_header = response.headers["set-cookie"]
        token = cookie_header.split("webmail_session=", 1)[1].split(";", 1)[0]
        session = main.decrypt_session(token)
        self.assertEqual(session["imap_host"], "imap.safe.example")
        self.assertTrue(session["imap_secure"])
        self.assertEqual(session["smtp_host"], "smtp.safe.example")
        self.assertNotEqual(session["imap_host"], "127.0.0.1")
        self.assertNotEqual(session["smtp_host"], "169.254.169.254")

    def test_login_supports_plain_imap_on_port_143(self):
        self._patch_env({
            "IMAP_HOST": "mail.safe.example",
            "IMAP_PORT": "143",
            "IMAP_SECURE": "true",
            "SMTP_HOST": "smtp.safe.example",
            "SMTP_PORT": "465",
        })
        captured = {}

        class FakePlainIMAP:
            def __init__(self, host, port, timeout):
                captured["imap_host"] = host
                captured["imap_port"] = port
                captured["imap_secure"] = False

            async def wait_hello_from_server(self):
                return None

            async def login(self, email, password):
                captured["login_email"] = email
                return None

            async def logout(self):
                return None

        with (
            patch.object(main.aioimaplib, "IMAP4", FakePlainIMAP),
            patch.object(main.aioimaplib, "IMAP4_SSL", side_effect=AssertionError("SSL IMAP should not be used")),
        ):
            response = asyncio.run(main.login(_request(), {
                "email": "user@example.com",
                "password": "correct-password",
            }))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured["imap_host"], "mail.safe.example")
        self.assertEqual(captured["imap_port"], 143)
        self.assertFalse(captured["imap_secure"])
        cookie_header = response.headers["set-cookie"]
        token = cookie_header.split("webmail_session=", 1)[1].split(";", 1)[0]
        session = main.decrypt_session(token)
        self.assertFalse(session["imap_secure"])

    def test_imap_port_143_forces_plain_even_if_secure_env_is_true(self):
        self._patch_env({
            "IMAP_HOST": "mail.safe.example",
            "IMAP_PORT": "143",
            "IMAP_SECURE": "true",
        })

        host, port, secure = asyncio.run(main._resolve_imap_config("example.com"))
        self.assertEqual((host, port, secure), ("mail.safe.example", 143, False))

    def test_session_mail_resolution_ignores_tampered_session_hosts(self):
        self._patch_env({
            "IMAP_HOST": "imap.env.example",
            "IMAP_PORT": "993",
            "SMTP_HOST": "smtp.env.example",
            "SMTP_PORT": "465",
        })
        captured = {}

        async def fake_get_pooled_imap(session, host, port, secure):
            captured["host"] = host
            captured["port"] = port
            captured["secure"] = secure
            return object()

        with patch.object(main, "_get_pooled_imap", AsyncMock(side_effect=fake_get_pooled_imap)):
            asyncio.run(main._get_imap_for_session({
                "email": "user@example.com",
                "password": "pw",
                "createdAt": 1,
                "imap_host": "127.0.0.1",
                "imap_port": 1143,
            }))

        self.assertEqual(captured, {"host": "imap.env.example", "port": 993, "secure": True})

    def test_imap_discovery_prefers_ssl_but_falls_back_to_plain_143(self):
        calls = []

        async def fake_probe(host, port, secure):
            calls.append((host, port, secure))
            return port == 143

        with (
            patch.object(main, "_probe_imap_server", AsyncMock(side_effect=fake_probe)),
            patch("dns.resolver.Resolver.resolve", side_effect=Exception("dns unavailable")),
        ):
            host_port = asyncio.run(main._discover_mail_host("example.com", "imap"))

        self.assertEqual(host_port, "mail.example.com:143")
        self.assertEqual(calls[:2], [
            ("mail.example.com", 993, True),
            ("mail.example.com", 143, False),
        ])

    def test_sanitizer_blocks_obfuscated_javascript_links(self):
        payloads = [
            '<a href="javascript:alert(1)">x</a>',
            '<a href="java&#x73;cript:alert(1)">x</a>',
            '<a href="jav\tascript:alert(1)">x</a>',
            '<a href=javascript:alert(1)>x</a>',
            '<form action="data:text/html,<script>alert(1)</script>"></form>',
        ]
        for payload in payloads:
            with self.subTest(payload=payload):
                sanitized = main._sanitize_html(payload)
                self.assertNotIn("javascript:", sanitized.lower())
                self.assertNotIn("data:text/html", sanitized.lower())
                self.assertIn('#"', sanitized)

    def test_sanitizer_preserves_safe_links(self):
        sanitized = main._sanitize_html(
            '<a href="https://example.com/path?q=1">ok</a>'
            '<img src="cid:image001@example.com">'
        )
        self.assertIn('href="https://example.com/path?q=1"', sanitized)
        self.assertIn('src="cid:image001@example.com"', sanitized)


if __name__ == "__main__":
    unittest.main()
