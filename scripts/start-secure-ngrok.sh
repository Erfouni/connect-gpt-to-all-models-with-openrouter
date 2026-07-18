#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.example to .env first." >&2
  exit 1
fi

NGROK_DOMAIN="$(node --env-file="$ENV_FILE" -e 'process.stdout.write(process.env.NGROK_DOMAIN ?? "")')"
MCP_HTTP_PORT="$(node --env-file="$ENV_FILE" -e 'process.stdout.write(process.env.MCP_HTTP_PORT ?? "3200")')"

if [[ ! "$NGROK_DOMAIN" =~ ^[A-Za-z0-9.-]+\.ngrok(-free)?\.app$ ]]; then
  echo "NGROK_DOMAIN must contain only your ngrok hostname, for example your-name.ngrok.app." >&2
  exit 1
fi

if [[ ! "$MCP_HTTP_PORT" =~ ^[0-9]+$ ]]; then
  echo "MCP_HTTP_PORT must be numeric." >&2
  exit 1
fi

# OAuth is enforced by remote-mcp-server.mjs. ngrok provides only the public
# TLS tunnel; its authtoken stays in ngrok's own local configuration.
exec ngrok http "http://127.0.0.1:$MCP_HTTP_PORT" --url "$NGROK_DOMAIN"
