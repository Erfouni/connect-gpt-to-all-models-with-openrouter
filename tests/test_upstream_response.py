import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import server


class Response:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.body


class UpstreamResponseTests(unittest.TestCase):
    def test_non_object_json_responses_return_502_in_models_endpoint(self):
        for value in (None, [], "unexpected"):
            with self.subTest(value=value):
                with patch.dict("os.environ", {"OPENROUTER_API_KEY": "test-key"}), patch.object(
                    server.urllib.request,
                    "urlopen",
                    return_value=Response(json.dumps(value).encode()),
                ):
                    with self.assertRaisesRegex(server.GatewayError, "OpenRouter returned an unexpected JSON value") as raised:
                        server.openrouter_request("GET", "/models")
                    self.assertEqual(raised.exception.status, 502)

        valid = {"data": [{"id": "provider/model"}]}
        with patch.dict("os.environ", {"OPENROUTER_API_KEY": "test-key"}), patch.object(
            server.urllib.request,
            "urlopen",
            return_value=Response(json.dumps(valid).encode()),
        ):
            self.assertEqual(server.openrouter_request("GET", "/models"), valid)

        server._model_cache.update(models=[], loaded_at=0)
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            real_urlopen = urllib.request.urlopen

            def mocked_urlopen(request, *args, **kwargs):
                url = request.full_url if isinstance(request, urllib.request.Request) else request
                if url.startswith(server.OPENROUTER_BASE_URL):
                    return Response(b"null")
                return real_urlopen(request, *args, **kwargs)

            with patch.dict("os.environ", {"OPENROUTER_API_KEY": "test-key"}), patch.object(
                server.urllib.request,
                "urlopen",
                side_effect=mocked_urlopen,
            ):
                with self.assertRaises(urllib.error.HTTPError) as raised:
                    urllib.request.urlopen(
                        f"http://127.0.0.1:{httpd.server_address[1]}/models", timeout=5
                    )
                self.assertEqual(raised.exception.code, 502)
                try:
                    self.assertIn(
                        b"OpenRouter returned an unexpected JSON value",
                        raised.exception.read(),
                    )
                finally:
                    raised.exception.close()
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
