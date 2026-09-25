"""Malformed request values are the caller's mistake: 400, never 500.

The MCP entry points validate with zod before they call the gateway, but the
gateway is also a plain HTTP API. A bad number used to reach a bare int() or
float() and come back as 500 "Internal error", and an out-of-range temperature
was forwarded to OpenRouter and came back as 502.
"""

import http.client
import json
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import server


def fake_completion(method, path, payload=None):
    return {
        "id": "gen-1",
        "model": payload["model"],
        "choices": [{"message": {"content": "OK"}, "finish_reason": "stop"}],
        "usage": {},
    }


class RequestValidationTests(unittest.TestCase):
    def setUp(self):
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        catalog = [{"id": "provider/newest", "name": "Newest", "created": 3}]
        self.cache = patch.dict(
            server._model_cache, {"models": catalog, "loaded_at": time.time()}
        )
        self.cache.start()
        # Nothing in these tests may reach OpenRouter unless a test allows it.
        self.upstream = patch.object(
            server, "openrouter_request", side_effect=AssertionError("upstream called")
        )
        self.upstream_mock = self.upstream.start()

    def tearDown(self):
        self.upstream.stop()
        self.cache.stop()
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, json.loads(response.read().decode("utf-8"))
        finally:
            connection.close()

    def post(self, path, value):
        body = json.dumps(value).encode("utf-8")
        return self.request(
            "POST", path, body, {"Content-Type": "application/json", "Content-Length": str(len(body))}
        )

    def assert_rejected(self, status, body, mentions):
        self.assertEqual(status, 400, body)
        self.assertIn(mentions, body["error"])

    def test_models_limit_that_is_not_a_number(self):
        status, body = self.request("GET", "/models?limit=abc")
        self.assert_rejected(status, body, "limit")

    def test_models_limit_is_still_clamped(self):
        for query in ("limit=999", "limit=0", "limit=-3", ""):
            status, body = self.request("GET", f"/models?{query}")
            self.assertEqual(status, 200, query)
            self.assertEqual(len(body["models"]), 1, query)

    def test_run_rejects_malformed_numbers(self):
        cases = [
            ({"max_tokens": "x"}, "max_tokens"),
            ({"max_tokens": 12.5}, "max_tokens"),
            ({"max_tokens": True}, "max_tokens"),
            ({"max_tokens": [64]}, "max_tokens"),
            ({"temperature": "x"}, "temperature"),
            ({"temperature": 5}, "temperature"),
            ({"temperature": -0.1}, "temperature"),
            ({"temperature": float("nan")}, "temperature"),
            ({"top_p": 1.5}, "top_p"),
            ({"top_p": {}}, "top_p"),
        ]
        for extra, mentions in cases:
            with self.subTest(extra=extra):
                status, body = self.post(
                    "/run", {"model": "provider/model", "prompt": "hi", **extra}
                )
                self.assert_rejected(status, body, mentions)

    def test_bad_request_is_rejected_before_the_catalog_is_fetched(self):
        with patch.object(server, "get_models", side_effect=AssertionError("catalog fetched")):
            status, body = self.post(
                "/run", {"model": "newest", "prompt": "hi", "temperature": "warm"}
            )
            self.assert_rejected(status, body, "temperature")
            status, body = self.post("/run", {"model": "newest"})
            self.assert_rejected(status, body, "prompt")

    def test_compare_rejects_a_bad_option_once(self):
        status, body = self.post(
            "/compare",
            {"models": ["provider/a", "provider/b"], "prompt": "hi", "max_tokens": "lots"},
        )
        self.assert_rejected(status, body, "max_tokens")

    def test_content_length_that_is_not_a_number(self):
        status, body = self.request("POST", "/run", b"{}", {"Content-Length": "abc"})
        self.assert_rejected(status, body, "Content-Length")

    def test_valid_values_still_reach_openrouter(self):
        self.upstream_mock.side_effect = fake_completion
        status, body = self.post(
            "/run",
            {
                "model": "newest",
                "prompt": "hi",
                "max_tokens": "100000",
                "temperature": 0,
                "top_p": "0.5",
                "reasoning_effort": "low",
            },
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(body["model_resolved"], "provider/newest")
        payload = self.upstream_mock.call_args.args[2]
        self.assertEqual(payload["max_tokens"], server.MAX_OUTPUT_TOKENS)
        self.assertEqual(payload["temperature"], 0.0)
        self.assertEqual(payload["top_p"], 0.5)
        self.assertEqual(payload["reasoning"], {"effort": "low"})
        self.assertEqual(payload["messages"], [{"role": "user", "content": "hi"}])


if __name__ == "__main__":
    unittest.main()
