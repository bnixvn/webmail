import asyncio
import os
import tempfile
import unittest

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp())
os.environ.setdefault("AUTH_SECRET", "test-auth-secret-for-uid-search-0000001")

from backend import main


class _Client:
    def __init__(self):
        self.calls = []

    async def uid_search(self, *criteria, charset="utf-8"):
        self.calls.append((criteria, charset))
        return "ok"

    async def uid(self, command, *args):
        raise AssertionError("aioimaplib 2 refuses SEARCH through uid()")


class UidSearchTests(unittest.TestCase):
    def test_ascii_criteria_go_without_a_charset(self):
        client = _Client()
        asyncio.run(main._uid_search(client, "HEADER", "Message-ID", '"<a@b>"'))
        self.assertEqual(client.calls, [(("HEADER", "Message-ID", '"<a@b>"'), None)])

    def test_non_ascii_text_is_sent_as_utf8(self):
        client = _Client()
        asyncio.run(main._uid_search(client, "SUBJECT", '"Hóa đơn"'))
        self.assertEqual(client.calls[0][1], "utf-8")

    def test_no_caller_uses_uid_search_through_uid(self):
        with open(main.__file__, encoding="utf-8") as handle:
            self.assertNotIn('client.uid("SEARCH"', handle.read())


if __name__ == "__main__":
    unittest.main()
