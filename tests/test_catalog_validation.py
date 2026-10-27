"""Reject malformed upstream catalog entries without poisoning the shared cache."""
import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import server


def malformed_entries():
    return [
        None, [], "unexpected", 7, {}, {"id": None}, {"id": 7}, {"id": " "},
        {"id": "provider/model", "created": "yesterday"},
        {"id": "provider/model", "created": [1]},
        {"id": "provider/model", "created": {"value": 1}},
    ]


class CatalogValidationTests(unittest.TestCase):
    def test_invalid_entries_are_rejected_before_cache_update(self):
        original = [{"id": "provider/original", "created": 1}]
        for entry in malformed_entries():
            with self.subTest(entry=entry), patch.dict(
                server._model_cache, models=original, loaded_at=0
            ), patch.object(server, "openrouter_request", return_value={"data": [entry]}):
                with self.assertRaises(server.GatewayError) as raised:
                    server.get_models(force=True)
                self.assertEqual(raised.exception.status, 502)
                self.assertIs(server._model_cache["models"], original)
                self.assertEqual(server._model_cache["loaded_at"], 0)

    def test_public_projection_rejects_invalid_entries(self):
        for entry in malformed_entries():
            with self.subTest(entry=entry):
                with self.assertRaises(server.GatewayError) as raised:
                    server.public_model(entry)
                self.assertEqual(raised.exception.status, 502)

    def test_valid_sparse_and_numeric_timestamp_models_are_preserved(self):
        models = [
            {"id": "provider/minimal"},
            {"id": "provider/null", "created": None},
            {"id": "provider/integer", "created": 3},
            {"id": "provider/string", "created": "2"},
            {"id": "provider/fractional", "created": 1.5},
        ]
        with patch.dict(server._model_cache, models=[], loaded_at=0), patch.object(
            server, "openrouter_request", return_value={"data": models}
        ):
            result = server.get_models(force=True)
            self.assertEqual(result, models)
            self.assertIsNot(result, models)
            self.assertEqual(server.public_model(models[0])["id"], "provider/minimal")
            self.assertIsNone(server.public_model(models[0])["created"])
            self.assertEqual(server.public_model(models[3])["created"], "2")

    def test_good_response_is_fetched_after_rejecting_bad_catalog(self):
        valid = [{"id": "provider/valid", "created": 2}]
        with patch.dict(server._model_cache, models=[], loaded_at=0), patch.object(
            server, "openrouter_request", side_effect=[{"data": [None]}, {"data": valid}]
        ) as upstream:
            with self.assertRaises(server.GatewayError):
                server.get_models()
            self.assertEqual(server.get_models(), valid)
            self.assertEqual(upstream.call_count, 2)


class CatalogEndpointValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)

    def request(self, path, method="GET"):
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=5)
        try:
            connection.request(method, path, body=b"{}" if method == "POST" else None)
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_nested_catalog_failures_return_502_on_listing_and_refresh(self):
        for entry in malformed_entries():
            for path, method in (("/models", "GET"), ("/models?search=model", "GET"), ("/refresh-models", "POST")):
                with self.subTest(entry=entry, path=path), patch.dict(
                    server._model_cache, models=[], loaded_at=0
                ), patch.object(server, "openrouter_request", return_value={"data": [entry]}):
                    status, body = self.request(path, method)
                    self.assertEqual(status, 502, body)
                    self.assertIn("catalog", body["error"].lower())
                    self.assertNotEqual(body["error"], "Internal error")

    def test_valid_catalog_keeps_sort_search_and_limit_behavior(self):
        models = [
            {"id": "provider/old", "created": 1},
            {"id": "provider/new", "name": "New model", "created": "3"},
        ]
        with patch.dict(server._model_cache, models=[], loaded_at=0), patch.object(
            server, "openrouter_request", return_value={"data": models}
        ):
            status, body = self.request("/models?limit=1")
            self.assertEqual(status, 200)
            self.assertEqual([m["id"] for m in body["models"]], ["provider/new"])
            self.assertEqual([m["id"] for m in server._model_cache["models"]], ["provider/old", "provider/new"])
            status, body = self.request("/models?search=old")
            self.assertEqual(status, 200)
            self.assertEqual([m["id"] for m in body["models"]], ["provider/old"])

    def test_empty_catalog_is_still_valid(self):
        with patch.dict(server._model_cache, models=[], loaded_at=0), patch.object(
            server, "openrouter_request", return_value={"data": []}
        ):
            self.assertEqual(self.request("/models"), (200, {"models": []}))


if __name__ == "__main__":
    unittest.main()
