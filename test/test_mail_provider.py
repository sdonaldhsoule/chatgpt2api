import unittest
from unittest import mock

from services.register.mail_provider import DuckMailProvider, TempMailPlusProvider


class TempMailPlusProviderTests(unittest.TestCase):
    def _provider(self, entry: dict) -> TempMailPlusProvider:
        return TempMailPlusProvider(
            {"type": "tempmail_plus", "provider_ref": "tempmail_plus#1", **entry},
            {"request_timeout": 1, "wait_timeout": 1, "wait_interval": 0.2, "user_agent": "test-agent"},
        )

    def test_create_mailbox_uses_configured_domain(self) -> None:
        provider = self._provider({"domain": ["mailto.plus", "rover.info"]})
        try:
            with mock.patch("services.register.mail_provider.random.choice", side_effect=lambda values: values[-1]):
                mailbox = provider.create_mailbox("fixed")
        finally:
            provider.close()

        self.assertEqual(mailbox["provider"], "tempmail_plus")
        self.assertEqual(mailbox["address"], "fixed@rover.info")

    def test_fetch_latest_message_loads_detail_by_mail_id(self) -> None:
        provider = self._provider({})
        calls: list[tuple[str, str, dict | None]] = []

        def fake_request(method: str, path: str, params=None):
            calls.append((method.upper(), path, params))
            if method.upper() == "GET" and path == "/mails":
                return {
                    "result": True,
                    "mail_list": [
                        {"mail_id": 10, "subject": "旧邮件", "time": "2026-01-01T00:00:00Z"},
                        {"mail_id": 11, "subject": "验证码", "time": "2026-01-01T00:01:00Z"},
                    ],
                }
            if method.upper() == "GET" and path == "/mails/11":
                return {
                    "result": True,
                    "mail_id": 11,
                    "subject": "验证码",
                    "from_mail": "noreply@example.com",
                    "text": "Verification code: 123456",
                    "html": "<p>Verification code: 123456</p>",
                    "date": "2026-01-01T00:01:00Z",
                }
            raise AssertionError(f"未预期的 TempMail.Plus 请求: {method} {path}")

        provider._request = fake_request
        try:
            message = provider.fetch_latest_message({"address": "fixed@mailto.plus"})
        finally:
            provider.close()

        self.assertIsNotNone(message)
        assert message is not None
        self.assertEqual(message["message_id"], "11")
        self.assertEqual(message["subject"], "验证码")
        self.assertIn("123456", message["text_content"])
        self.assertEqual(calls[1], ("GET", "/mails/11", {"email": "fixed@mailto.plus"}))


class DuckMailProviderTests(unittest.TestCase):
    def _provider(self, entry: dict) -> DuckMailProvider:
        return DuckMailProvider(
            {"type": "duckmail", "provider_ref": "duckmail#1", "api_key": "test-key", **entry},
            {"request_timeout": 1, "wait_timeout": 1, "wait_interval": 0.2, "user_agent": "test-agent"},
        )

    def _attach_account_api(self, provider: DuckMailProvider, domains_response=None):
        calls: list[tuple[str, str]] = []

        def fake_request(method: str, path: str, **kwargs):
            calls.append((method.upper(), path))
            if method.upper() == "GET" and path == "/domains":
                return domains_response if domains_response is not None else {"hydra:member": []}
            if method.upper() == "POST" and path == "/accounts":
                return {"id": "account-id"}
            if method.upper() == "POST" and path == "/token":
                return {"token": "mail-token"}
            raise AssertionError(f"未预期的 DuckMail 请求: {method} {path}")

        provider._request = fake_request
        return calls

    def test_duckmail_uses_configured_domains_randomly(self) -> None:
        provider = self._provider({"domain": ["alpha.test", "beta.test"], "default_domain": "fallback.test"})
        calls = self._attach_account_api(provider)
        try:
            with mock.patch("services.register.mail_provider.random.choice", side_effect=lambda values: values[-1]):
                mailbox = provider.create_mailbox("fixed")
        finally:
            provider.close()

        self.assertEqual(mailbox["address"], "fixed@beta.test")
        self.assertNotIn(("GET", "/domains"), calls)

    def test_duckmail_reads_api_domains_when_no_configured_domain(self) -> None:
        provider = self._provider({"default_domain": "fallback.test"})
        self._attach_account_api(
            provider,
            {"hydra:member": [{"domain": "api-a.test"}, {"name": "api-b.test"}]},
        )
        try:
            with mock.patch("services.register.mail_provider.random.choice", side_effect=lambda values: values[-1]):
                mailbox = provider.create_mailbox("fixed")
        finally:
            provider.close()

        self.assertEqual(mailbox["address"], "fixed@api-b.test")

    def test_duckmail_falls_back_to_default_domain_list(self) -> None:
        provider = self._provider({"default_domain": "fallback-a.test\nfallback-b.test"})
        self._attach_account_api(provider, {"hydra:member": []})
        try:
            with mock.patch("services.register.mail_provider.random.choice", side_effect=lambda values: values[-1]):
                mailbox = provider.create_mailbox("fixed")
        finally:
            provider.close()

        self.assertEqual(mailbox["address"], "fixed@fallback-b.test")


if __name__ == "__main__":
    unittest.main()
