# Local MCP Setup

## 1. Install

```bash
cp .env.example .env
npm install
```

Add only your own `OPENROUTER_API_KEY` to `.env`.

## 2. Start the private gateway

```bash
python3 server.py
```

The default address is `http://127.0.0.1:3188`. It is intentionally not
reachable from other computers.

## 3. Configure a local MCP client

Copy `examples/mcp-client-config.json`, replace the absolute path, and merge the
entry into your client's MCP configuration. If you set
`OPENROUTER_AGENT_TOKEN` in `.env`, pass the same value to the MCP process using
a secure environment/secret store rather than committing it to JSON.

## 4. Test

```bash
npm test
curl http://127.0.0.1:3188/health
```

`npm test` checks only the MCP protocol and tool definitions. It does not make a
paid OpenRouter request.

## Existing Mac MCP bridge

An existing trusted MCP on the same Mac can use its HTTP request tool to call
the gateway's loopback URL. This is useful when ChatGPT web is already connected
to that MCP. Paste the bridge rules from `chatgpt-agent-instructions.md` into
your GPT instructions.

Do not expose a broad filesystem/shell MCP publicly. A dedicated model-router
MCP has a much smaller attack surface.
