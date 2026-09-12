import asyncio
import os
import subprocess
import sys
import tempfile
import unittest
from email.message import EmailMessage
from types import SimpleNamespace
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

    def test_inline_cid_images_are_rewritten_to_attachment_urls(self):
        msg = EmailMessage()
        msg["From"] = "Bank <bank@example.com>"
        msg["To"] = "User <user@example.com>"
        msg["Subject"] = "Inline image"
        msg.set_content("Fallback text")
        msg.add_alternative(
            '<html><body><img src="cid:header.png@example"></body></html>',
            subtype="html",
        )
        html_part = msg.get_payload()[1]
        html_part.add_related(
            b"fake-png",
            maintype="image",
            subtype="png",
            cid="<header.png@example>",
            filename="header.png",
            disposition="inline",
        )

        parsed = asyncio.run(main._async_parse_email(msg.as_bytes(), uid=42, folder="INBOX"))
        sanitized = main._sanitize_html(parsed["html"])

        self.assertIn('/api/messages/42/attachments/0?folder=INBOX', sanitized)
        self.assertNotIn('src="#"', sanitized)
        self.assertEqual(parsed["attachments"][0]["cid"], "header.png@example")

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
                return SimpleNamespace(result="OK", lines=[])

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
                return SimpleNamespace(result="OK", lines=[])

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

    def test_login_rejects_non_ok_imap_response(self):
        self._patch_env({
            "IMAP_HOST": "imap.safe.example",
            "IMAP_PORT": "993",
            "SMTP_HOST": "smtp.safe.example",
            "SMTP_PORT": "465",
        })

        class RejectingIMAP:
            def __init__(self, host, port, timeout):
                pass

            async def wait_hello_from_server(self):
                return None

            async def login(self, email, password):
                return SimpleNamespace(result="NO", lines=[b"NO LOGIN failed"])

            async def logout(self):
                return None

        with patch.object(main.aioimaplib, "IMAP4_SSL", RejectingIMAP):
            with self.assertRaises(main.HTTPException) as raised:
                asyncio.run(main.login(_request(), {
                    "email": "user@example.com",
                    "password": "wrong-password",
                }))

        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(raised.exception.detail["code"], "INVALID_CREDENTIALS")

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

    def test_with_imap_retry_turns_session_auth_failure_into_401(self):
        self._patch_env({
            "IMAP_HOST": "imap.env.example",
            "IMAP_PORT": "993",
        })
        session = {
            "email": "user@example.com",
            "password": "expired-password",
            "createdAt": int(main.time.time() * 1000),
        }

        with (
            patch.object(main, "_get_pooled_imap", AsyncMock(side_effect=main.SessionExpiredError())),
            patch.object(main, "_evict_imap", AsyncMock()) as evict,
        ):
            with self.assertRaises(main.HTTPException) as raised:
                asyncio.run(main.with_imap_retry(session, lambda client: None))

        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(raised.exception.detail["code"], "SESSION_EXPIRED")
        evict.assert_awaited_once_with("user@example.com", "password", True)

    def test_imap_auth_failure_response_is_session_expired(self):
        response = SimpleNamespace(
            result="NO",
            lines=[b"NO [AUTHENTICATIONFAILED] Authentication failed."],
        )

        with self.assertRaises(main.SessionExpiredError):
            main._require_imap_ok(response, "SELECT INBOX")

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

    def test_sanitizer_blocks_remote_images_by_default(self):
        html = '<img src="http://tracker.example/pixel.png">'
        blocked = main._sanitize_html(html)
        self.assertNotIn(html, blocked)
        self.assertIn(f'src="{main._BLANK_PIXEL}"', blocked)
        self.assertIn('data-blocked-src="http://tracker.example/pixel.png"', blocked)

        shown = main._sanitize_html(html, show_images=True)
        self.assertIn('src="http://tracker.example/pixel.png"', shown)
        self.assertNotIn("data-blocked-src", shown)

    def test_sanitizer_does_not_block_unquoted_or_cid_images(self):
        blocked = main._sanitize_html('<img src=http://tracker.example/pixel.png>')
        self.assertIn('data-blocked-src="http://tracker.example/pixel.png"', blocked)
        self.assertIn(main._BLANK_PIXEL, blocked)

        cid_html = main._sanitize_html('<img src="cid:abc@example.com">')
        self.assertIn('src="cid:abc@example.com"', cid_html)
        self.assertNotIn("data-blocked-src", cid_html)

    def test_sanitizer_blocking_never_touches_links(self):
        sanitized = main._sanitize_html('<a href="http://example.com">link</a>')
        self.assertIn('href="http://example.com"', sanitized)
        self.assertNotIn("data-blocked-src", sanitized)

    def _signed_smime_message(self, from_header="Nguyen Van A <sender@bnix.vn>",
                              cert_email="sender@bnix.vn", body=b"Signed body.\r\n",
                              issuer_org=None):
        """Build a real S/MIME signed message with a throwaway certificate."""
        import datetime
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives.serialization import Encoding, pkcs7

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, "Nguyen Van A"),
            x509.NameAttribute(NameOID.EMAIL_ADDRESS, cert_email),
        ])
        issuer = subject if issuer_org is None else x509.Name([
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, issuer_org),
            x509.NameAttribute(NameOID.COMMON_NAME, f"{issuer_org} Secure Email CA"),
        ])
        now = datetime.datetime.now(datetime.timezone.utc)
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=365))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.SubjectAlternativeName([x509.RFC822Name(cert_email)]), critical=False)
            .sign(key, hashes.SHA256())
        )
        content = b"Content-Type: text/plain; charset=utf-8\r\n\r\n" + body
        signed = (
            pkcs7.PKCS7SignatureBuilder()
            .set_data(content)
            .add_signer(cert, key, hashes.SHA256())
            .sign(Encoding.SMIME, [pkcs7.PKCS7Options.DetachedSignature])
        )
        return (f"From: {from_header}\r\nTo: me@bnix.vn\r\nSubject: Signed\r\n").encode() + signed

    def test_smime_signed_message_is_recognised(self):
        parsed = asyncio.run(main._async_parse_email(self._signed_smime_message()))
        smime = parsed["smime"]
        self.assertEqual(smime["type"], "signed")
        self.assertEqual(smime["certificate"]["emails"], ["sender@bnix.vn"])
        self.assertTrue(smime["signerMatchesFrom"])
        self.assertFalse(smime["certificate"]["expired"])
        # Self-signed: the signature holds, but nothing vouches for the identity,
        # so it must be reported as untrusted rather than merely "less verified".
        self.assertTrue(smime["certificate"]["selfSigned"])
        if smime["verification"]["checked"]:
            self.assertTrue(smime["verification"]["signatureValid"])
            self.assertFalse(smime["verification"]["chainTrusted"])

    def test_smime_detects_tampered_body(self):
        raw = self._signed_smime_message(body=b"Original body.\r\n")
        tampered = raw.replace(b"Original body.", b"Rewritten body")
        parsed = asyncio.run(main._async_parse_email(tampered))
        verification = parsed["smime"]["verification"]
        if verification["checked"]:
            self.assertFalse(verification["signatureValid"])

    def test_smime_flags_certificate_not_belonging_to_sender(self):
        raw = self._signed_smime_message(from_header="Someone Else <attacker@evil.example>")
        parsed = asyncio.run(main._async_parse_email(raw))
        self.assertFalse(parsed["smime"]["signerMatchesFrom"])

    def test_smime_detects_encrypted_message(self):
        raw = (
            b"From: a@b.com\r\nTo: c@d.com\r\nSubject: secret\r\n"
            b'Content-Type: application/pkcs7-mime; smime-type=enveloped-data; name="smime.p7m"\r\n'
            b"Content-Transfer-Encoding: base64\r\n\r\nMIIBOgYJKoZIhvcNAQcD\r\n"
        )
        self.assertEqual(asyncio.run(main._async_parse_email(raw))["smime"]["type"], "encrypted")

    def test_plain_message_has_no_smime_block(self):
        raw = b"From: a@b.com\r\nTo: c@d.com\r\nSubject: hi\r\nContent-Type: text/plain\r\n\r\nhello\r\n"
        self.assertIsNone(asyncio.run(main._async_parse_email(raw))["smime"])

    def test_image_trust_is_per_account_and_gates_the_sanitizer(self):
        import sqlite3

        account, other, sender = "owner@bnix.vn", "someone@bnix.vn", "news@shop.com"
        self.assertFalse(main._images_trusted_for(account, sender))

        with sqlite3.connect(main.BLOCKLIST_DB) as db:
            db.execute(
                "INSERT OR IGNORE INTO image_trusted_senders (account, email, created_at) VALUES (?,?,?)",
                (account, sender, "2026-01-01T00:00:00"),
            )
            db.commit()

        self.assertTrue(main._images_trusted_for(account, sender))
        self.assertTrue(main._images_trusted_for(account, "NEWS@Shop.com".lower()))
        # One account trusting a sender must not affect anyone else.
        self.assertFalse(main._images_trusted_for(other, sender))
        self.assertIn(sender, main._image_trusted_senders(account))

        html = '<img src="http://cdn.shop.com/banner.jpg">'
        self.assertIn("data-blocked-src", main._sanitize_html(html))
        self.assertNotIn("data-blocked-src", main._sanitize_html(html, show_images=True))

    def test_certificate_subject_falls_back_when_there_is_no_common_name(self):
        """Sectigo's email certificates carry only emailAddress in the subject."""
        import datetime
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        issuer = x509.Name([x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Sectigo Limited")])
        now = datetime.datetime.now(datetime.timezone.utc)

        def build(subject):
            return (
                x509.CertificateBuilder()
                .subject_name(subject)
                .issuer_name(issuer)
                .public_key(key.public_key())
                .serial_number(x509.random_serial_number())
                .not_valid_before(now)
                .not_valid_after(now + datetime.timedelta(days=365))
                .add_extension(
                    x509.SubjectAlternativeName([x509.RFC822Name("hotro@bnix.vn")]), critical=False
                )
                .sign(key, hashes.SHA256())
            )

        only_email = build(x509.Name([x509.NameAttribute(NameOID.EMAIL_ADDRESS, "hotro@bnix.vn")]))
        self.assertEqual(main._describe_certificate(only_email)["subject"], "hotro@bnix.vn")

        empty_subject = build(x509.Name([]))
        self.assertEqual(main._describe_certificate(empty_subject)["subject"], "hotro@bnix.vn")

        named = build(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "BNIX Support")]))
        self.assertEqual(main._describe_certificate(named)["subject"], "BNIX Support")

    def test_each_message_reports_its_own_signer_and_issuer(self):
        """Signatures are per message: different senders, different authorities."""
        senders = [
            ("hotro@bnix.vn", "Sectigo Limited"),
            ("billing@bank.example", "DigiCert Inc"),
            ("noreply@github.example", "GlobalSign nv-sa"),
        ]
        for sender, issuer_org in senders:
            with self.subTest(sender=sender):
                raw = self._signed_smime_message(
                    from_header=sender, cert_email=sender, issuer_org=issuer_org
                )
                cert = asyncio.run(main._async_parse_email(raw))["smime"]["certificate"]
                self.assertEqual(cert["emails"], [sender])
                self.assertEqual(cert["issuerOrganization"], issuer_org)

    def test_certificate_pem_is_exported_for_download(self):
        cert = asyncio.run(main._async_parse_email(self._signed_smime_message()))["smime"]["certificate"]
        pem = cert["pem"]
        self.assertTrue(pem.startswith("-----BEGIN CERTIFICATE-----"))
        # Must load back as the very certificate it describes.
        from cryptography import x509
        reloaded = x509.load_pem_x509_certificate(pem.encode())
        self.assertEqual(format(reloaded.serial_number, "x"), cert["serial"])

    def test_ssrf_guard_rejects_private_and_non_http_urls(self):
        for url in (
            "http://127.0.0.1/x",
            "http://169.254.169.254/latest/meta-data/",
            "http://10.0.0.5/internal",
            "ftp://example.com/x",
            "javascript:alert(1)",
        ):
            with self.subTest(url=url):
                with self.assertRaises(main.HTTPException):
                    main._assert_public_http_url(url)
        main._assert_public_http_url("https://example.com/unsubscribe")  # should not raise

    def test_list_unsubscribe_header_parsing(self):
        parsed = main._parse_list_unsubscribe(
            "<mailto:unsub@x.com>, <https://x.com/unsub?id=1>", "List-Unsubscribe=One-Click"
        )
        self.assertEqual(parsed, {"mailto": "mailto:unsub@x.com", "url": "https://x.com/unsub?id=1", "oneClick": True})
        self.assertIsNone(main._parse_list_unsubscribe(None, None))
        self.assertFalse(main._parse_list_unsubscribe("<https://x.com/unsub>", None)["oneClick"])

    def test_primary_domain_is_rejected_as_admin_alias(self):
        # Adding the installer-configured primary domain as an alias would put a
        # second site block for the same host into the Caddy include file, which
        # breaks every later alias reload.
        with patch.object(main, "PRIMARY_DOMAIN", "webmail.example.com"):
            with patch.object(main, "require_admin", new=AsyncMock(return_value=None)):
                with self.assertRaises(main.HTTPException) as ctx:
                    asyncio.run(main.admin_add_domain(_request(), {"aliasDomain": "WebMail.Example.com."}))
        self.assertEqual(ctx.exception.status_code, 409)

    def test_other_domains_still_allowed_as_admin_alias(self):
        calls = {}

        def _fake_sync(alias_domain):
            calls["alias"] = alias_domain
            return True

        with patch.object(main, "PRIMARY_DOMAIN", "webmail.example.com"):
            with patch.object(main, "require_admin", new=AsyncMock(return_value=None)):
                with patch.object(main, "_add_caddy_domain", new=_fake_sync):
                    response = asyncio.run(
                        main.admin_add_domain(_request(), {"aliasDomain": "mail.other.com"})
                    )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(calls.get("alias"), "mail.other.com")


    # ── Attachments must not be renderable as HTML/SVG on our own origin ──────

    def test_html_attachment_is_forced_to_a_download(self):
        # An attacker picks the Content-Type on anything they mail you. Served
        # inline as text/html it would run on the webmail origin, and
        # script-src 'self' would happily load a second attachment as its
        # script, so the type has to be overridden, not just sniffed.
        for declared in ("text/html", "text/html; charset=utf-8", "image/svg+xml",
                         "application/xhtml+xml", "text/xml", "application/javascript"):
            with self.subTest(declared=declared):
                media, disposition = main._safe_attachment_headers(declared, download=False)
                self.assertEqual(media, "application/octet-stream")
                self.assertEqual(disposition, "attachment")

    def test_viewable_attachments_still_render_inline(self):
        for declared in ("image/png", "image/jpeg", "application/pdf", "text/plain"):
            with self.subTest(declared=declared):
                media, disposition = main._safe_attachment_headers(declared, download=False)
                self.assertEqual(media, declared)
                self.assertEqual(disposition, "inline")

    def test_download_flag_never_renders_inline(self):
        media, disposition = main._safe_attachment_headers("image/png", download=True)
        self.assertEqual(media, "image/png")
        self.assertEqual(disposition, "attachment")

    # ── S3 objects belong to one account ─────────────────────────────────────

    def test_s3_key_outside_the_account_namespace_is_rejected(self):
        cfg = {"prefix": "mail"}
        own = main._s3_build_key("me@bnix.vn", "mail", "report.pdf")
        self.assertEqual(main._s3_require_own_key("me@bnix.vn", cfg, own), own)

        for foreign in (
            "mail/someone_else_bnix.vn/abc123/secret.pdf",
            "mail/backups/db.sql",
            "me_bnix.vn/abc123/no-prefix.pdf",   # right account, wrong prefix
            own.replace("mail/me_bnix.vn/", "mail/me_bnix.vn_evil/"),
            "",
        ):
            with self.subTest(key=foreign):
                with self.assertRaises(main.HTTPException) as ctx:
                    main._s3_require_own_key("me@bnix.vn", cfg, foreign)
                self.assertEqual(ctx.exception.status_code, 403)

    def test_s3_owner_prefix_is_not_a_bare_substring_match(self):
        # "me@bnix.vn" must not unlock "meredith@bnix.vn"'s objects.
        cfg = {"prefix": ""}
        victim = main._s3_build_key("meredith@bnix.vn", "", "payslip.pdf")
        with self.assertRaises(main.HTTPException):
            main._s3_require_own_key("me@bnix.vn", cfg, victim)

    # ── Admin password storage ───────────────────────────────────────────────

    def test_admin_password_hash_is_salted_and_verifiable(self):
        stored = main._admin_hash_password("correct horse battery")
        self.assertTrue(stored.startswith("pbkdf2_sha256$"))
        self.assertNotIn("correct horse battery", stored)
        self.assertTrue(main._admin_verify_password("correct horse battery", stored))
        self.assertFalse(main._admin_verify_password("wrong", stored))
        # Same password, different salt each time.
        self.assertNotEqual(stored, main._admin_hash_password("correct horse battery"))
        self.assertFalse(main._admin_is_legacy_hash(stored))

    def test_legacy_sha256_admin_hash_still_verifies(self):
        import hashlib
        legacy = hashlib.sha256(b"old-password").hexdigest()
        self.assertTrue(main._admin_verify_password("old-password", legacy))
        self.assertFalse(main._admin_verify_password("nope", legacy))
        self.assertTrue(main._admin_is_legacy_hash(legacy))

    # ── Sanitiser: remote-content vectors that are not <img> ──────────────────

    def test_sanitizer_drops_base_link_and_meta_refresh(self):
        html = (
            '<base href="https://evil.example/">'
            '<link rel="stylesheet" href="https://evil.example/track.css">'
            '<meta http-equiv="refresh" content="0;url=https://evil.example/">'
            "<p>Hello</p>"
        )
        cleaned = main._sanitize_html(html)
        self.assertNotIn("<base", cleaned.lower())
        self.assertNotIn("<link", cleaned.lower())
        self.assertNotIn("refresh", cleaned.lower())
        self.assertIn("<p>Hello</p>", cleaned)

    def test_sanitizer_drops_css_import(self):
        html = "<style>@import url('https://evil.example/t.css'); @import \"https://evil.example/u.css\"; p{color:red}</style>"
        cleaned = main._sanitize_html(html)
        self.assertNotIn("evil.example", cleaned)
        self.assertIn("color:red", cleaned)

    # ── Mail headers ─────────────────────────────────────────────────────────

    def test_header_values_cannot_carry_newlines(self):
        message, to, _cc, _bcc = main._build_mime_message(
            "me@bnix.vn",
            {
                "to": "friend@example.com",
                "subject": "Hi\r\nBcc: victim@example.com",
                "replyTo": "a@b.com\nX-Injected: yes",
                "text": "body",
            },
        )
        self.assertEqual(to, ["friend@example.com"])
        # The crafted text survives as part of the header's *value*; what must
        # not happen is it becoming a header of its own.
        self.assertIsNone(message["Bcc"])
        self.assertIsNone(message["X-Injected"])
        header_lines = [
            line for line in message.as_string().split("\n\n", 1)[0].splitlines()
            if line[:1] not in (" ", "\t")
        ]
        for line in header_lines:
            self.assertFalse(line.lower().startswith(("bcc:", "x-injected:")), line)

    def test_attachment_response_headers_are_hardened_end_to_end(self):
        from fastapi.testclient import TestClient

        async def _fake_source(session, folder, uid):
            return {}, b"raw"

        async def _fake_attachment(source, index):
            return {
                "filename": "invoice.html",
                "contentType": "text/html",
                "payload": b"<script>alert(1)</script>",
            }

        with patch.object(main, "require_session", new=AsyncMock(return_value={"email": "me@bnix.vn"})):
            with patch.object(main, "_fetch_message_source", new=_fake_source):
                with patch.object(main, "_async_get_attachment", new=_fake_attachment):
                    with TestClient(main.app) as client:
                        resp = client.get("/api/messages/1/attachments/0?folder=INBOX")

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers["content-type"], "application/octet-stream")
        self.assertTrue(resp.headers["content-disposition"].startswith("attachment;"))
        self.assertEqual(resp.headers["x-content-type-options"], "nosniff")
        # The route's own locked-down policy must survive the global middleware.
        self.assertIn("default-src 'none'", resp.headers["content-security-policy"])
        self.assertIn("sandbox", resp.headers["content-security-policy"])
        self.assertNotIn("script-src 'self'", resp.headers["content-security-policy"])

    def test_no_cors_headers_are_returned_to_a_foreign_origin(self):
        from fastapi.testclient import TestClient

        with TestClient(main.app) as client:
            resp = client.get(
                "/health",
                headers={"Origin": "https://evil.example", "Cookie": "webmail_session=abc"},
            )
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.headers.get("access-control-allow-origin"))
        self.assertIsNone(resp.headers.get("access-control-allow-credentials"))

    # ── SSRF: the checked address is the address we connect to ───────────────

    def test_outbound_request_connects_to_the_address_it_checked(self):
        captured = {}

        class _FakeResponse:
            status_code = 200
            headers = {"content-type": "image/png"}
            content = b"\x89PNG"

        class _FakeClient:
            def __init__(self, **kwargs):
                captured["client_kwargs"] = kwargs

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def request(self, method, url, **kwargs):
                captured["method"] = method
                captured["url"] = url
                captured["headers"] = kwargs.get("headers")
                captured["extensions"] = kwargs.get("extensions")
                return _FakeResponse()

        def _fake_getaddrinfo(host, port, *a, **kw):
            # First answer is public; every later one is loopback. A second
            # resolution — the rebind — must never be the one we connect to.
            calls = captured.setdefault("dns_calls", [])
            calls.append(host)
            if len(calls) == 1:
                return [(main.socket.AF_INET, 1, 6, "", ("93.184.216.34", port))]
            return [(main.socket.AF_INET, 1, 6, "", ("127.0.0.1", port))]

        with patch.object(main.socket, "getaddrinfo", _fake_getaddrinfo):
            with patch.object(main.httpx, "AsyncClient", _FakeClient):
                asyncio.run(main._request_pinned("GET", "https://evil.example/logo.svg?a=1"))

        # Connects to the literal address, not to a name that can change answer.
        self.assertEqual(captured["url"], "https://93.184.216.34:443/logo.svg?a=1")
        self.assertEqual(captured["headers"]["Host"], "evil.example")
        # TLS still validates against the real hostname.
        self.assertEqual(captured["extensions"]["sni_hostname"], "evil.example")
        self.assertFalse(captured["client_kwargs"]["follow_redirects"])

    def test_outbound_request_refuses_private_and_non_http_targets(self):
        for bad in ("http://127.0.0.1/x", "http://169.254.169.254/latest/meta-data/",
                    "http://10.0.0.5/", "ftp://example.com/x", "https:///nohost"):
            with self.subTest(url=bad):
                with self.assertRaises(main.HTTPException) as ctx:
                    asyncio.run(main._request_pinned("GET", bad, timeout=2))
                self.assertEqual(ctx.exception.status_code, 400)

    def test_outbound_request_rejects_a_host_with_any_private_answer(self):
        def _split_horizon(host, port, *a, **kw):
            return [
                (main.socket.AF_INET, 1, 6, "", ("93.184.216.34", port)),
                (main.socket.AF_INET, 1, 6, "", ("127.0.0.1", port)),
            ]

        with patch.object(main.socket, "getaddrinfo", _split_horizon):
            with self.assertRaises(main.HTTPException) as ctx:
                asyncio.run(main._request_pinned("GET", "https://evil.example/"))
        self.assertEqual(ctx.exception.status_code, 400)

    # ── Signing out actually invalidates the cookie ──────────────────────────

    def test_signing_out_invalidates_a_copy_of_the_cookie(self):
        session = {
            "email": "me@bnix.vn",
            "password": "hunter2",
            "sid": "test-sid-abc",
            "createdAt": int(main.time.time() * 1000),
        }
        token = main.encrypt_session(session)
        self.assertIsNotNone(main.decrypt_session(token))

        main._revoke_session(session)
        # The stolen copy of the same cookie is now worthless.
        self.assertIsNone(main.decrypt_session(token))

    def test_revoking_one_session_leaves_other_sessions_alone(self):
        now = int(main.time.time() * 1000)
        phone = {"email": "me@bnix.vn", "password": "x", "sid": "sid-phone", "createdAt": now}
        laptop = {"email": "me@bnix.vn", "password": "x", "sid": "sid-laptop", "createdAt": now}
        phone_token = main.encrypt_session(phone)
        laptop_token = main.encrypt_session(laptop)

        main._revoke_session(phone)
        self.assertIsNone(main.decrypt_session(phone_token))
        self.assertIsNotNone(main.decrypt_session(laptop_token))

    def test_admin_sign_out_invalidates_the_admin_cookie(self):
        data = {
            "admin": True,
            "username": "admin",
            "sid": "sid-admin-1",
            "createdAt": int(main.time.time() * 1000),
        }
        token = main._admin_encrypt_session(data)
        self.assertIsNotNone(main._admin_decrypt_session(token))
        main._revoke_session(data, max_age=main.ADMIN_SESSION_MAX_AGE)
        self.assertIsNone(main._admin_decrypt_session(token))

    def test_login_issues_a_revocable_session_id(self):
        self._patch_env({"IMAP_HOST": "imap.safe.example", "SMTP_HOST": "smtp.safe.example"})

        class FakeIMAP:
            def __init__(self, host, port, timeout):
                pass

            async def wait_hello_from_server(self):
                return None

            async def login(self, email, password):
                return SimpleNamespace(result="OK", lines=[])

            async def logout(self):
                return None

        with patch.object(main.aioimaplib, "IMAP4_SSL", FakeIMAP):
            response = asyncio.run(main.login(_request(), {
                "email": "user@example.com", "password": "pw",
            }))
        token = response.headers["set-cookie"].split("webmail_session=", 1)[1].split(";", 1)[0]
        session = main.decrypt_session(token)
        self.assertTrue(session.get("sid"))

        main._revoke_session(session)
        self.assertIsNone(main.decrypt_session(token))

    def test_a_broken_session_store_denies_rather_than_admits(self):
        import sqlite3

        def _explode(*a, **kw):
            raise RuntimeError("disk gone")

        with patch.object(sqlite3, "connect", _explode):
            self.assertTrue(main._session_is_revoked("any-sid"))
        # ...and an unreadable store must not lock out sessions that were never
        # signed out: a cookie with no id at all is still fine.
        self.assertFalse(main._session_is_revoked(None))
