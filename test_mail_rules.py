import os
import tempfile
import unittest
from email.message import EmailMessage

from fastapi import HTTPException


_DATA_DIR = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _DATA_DIR
os.environ["AUTH_SECRET"] = "test-auth-secret-for-mail-rules-0001"

from backend import main


class MailRuleTests(unittest.TestCase):
    def test_normalizes_text_and_flag_conditions(self):
        rule = main._normalize_mail_rule("user@example.com", {
            "name": "Invoices",
            "mode": "any",
            "conditions": [
                {"field": "from", "operator": "contains", "value": "billing@"},
                {"field": "has_attachment"},
            ],
            "actions": [{"type": "move", "destination": "Archive"}],
            "stop": True,
        })

        self.assertEqual(rule["name"], "Invoices")
        self.assertEqual(rule["mode"], "any")
        self.assertEqual(rule["conditions"][1]["field"], "has_attachment")
        self.assertEqual(rule["actions"][0]["destination"], "Archive")
        self.assertTrue(rule["stop"])

    def test_rejects_rule_without_actions(self):
        with self.assertRaises(HTTPException):
            main._normalize_mail_rule("user@example.com", {
                "name": "Broken",
                "conditions": [{"field": "subject", "value": "x"}],
                "actions": [],
            })

    def test_matches_message_context_case_insensitively(self):
        msg = EmailMessage()
        msg["From"] = "Billing <billing@example.com>"
        msg["To"] = "User <user@example.com>"
        msg["Subject"] = "July Invoice"
        msg.set_content("Your invoice is attached.")
        msg.add_attachment(b"pdf", maintype="application", subtype="pdf", filename="invoice.pdf")

        context = main._rule_message_context(1, '1 FETCH (UID 1 FLAGS ())', msg.as_bytes())
        rule = {
            "mode": "all",
            "conditions": [
                {"field": "from", "operator": "contains", "value": "BILLING"},
                {"field": "subject", "operator": "contains", "value": "invoice"},
                {"field": "has_attachment", "operator": "is", "value": "true"},
            ],
        }

        self.assertTrue(main._rule_matches_message(rule, context))


if __name__ == "__main__":
    unittest.main()
