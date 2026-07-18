#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.example to .env and configure Auth0 first." >&2
  exit 1
fi

exec node --env-file="$ENV_FILE" "$PROJECT_DIR/remote-mcp-server.mjs"
