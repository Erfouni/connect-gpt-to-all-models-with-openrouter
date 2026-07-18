#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_PORT="${MCP_PORT:-3100}"
export OPENROUTER_AGENT_URL="${OPENROUTER_AGENT_URL:-http://127.0.0.1:3188}"

exec "$PROJECT_DIR/node_modules/.bin/supergateway" \
  --stdio "node \"$PROJECT_DIR/mcp-server.mjs\"" \
  --outputTransport streamableHttp \
  --streamableHttpPath /mcp \
  --port "$MCP_PORT" \
  --healthEndpoint /healthz \
  --stateful \
  --sessionTimeout 600000
