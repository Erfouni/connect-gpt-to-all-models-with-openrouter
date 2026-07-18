import os
import unittest
from unittest.mock import patch

import server


class GatewayTests(unittest.TestCase):
    def test_exact_slug_does_not_need_catalog(self):
        self.assertEqual(server.resolve_model("provider/model-name"), "provider/model-name")

    def test_prompt_building(self):
        self.assertEqual(
            server.build_messages({"system": "Be concise", "prompt": "Hello"}),
            [
                {"role": "system", "content": "Be concise"},
                {"role": "user", "content": "Hello"},
            ],
        )

    def test_kimi_override(self):
        with patch.dict(os.environ, {"DEFAULT_KIMI_MODEL": "moonshotai/example"}):
            self.assertEqual(server.resolve_model("kimi"), "moonshotai/example")

    def test_missing_prompt_is_rejected(self):
        with self.assertRaises(server.GatewayError):
            server.build_messages({})


if __name__ == "__main__":
    unittest.main()
