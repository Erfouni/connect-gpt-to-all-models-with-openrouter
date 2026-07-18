#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export OPENROUTER_AGENT_URL="${OPENROUTER_AGENT_URL:-http://127.0.0.1:3188}"
exec node "$PROJECT_DIR/mcp-server.mjs"
