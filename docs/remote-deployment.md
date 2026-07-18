# Protected Remote MCP / ChatGPT Web

ChatGPT web cannot execute a file path on your Mac. It needs an HTTPS URL for a
remote Streamable HTTP MCP server, unless it is already connected to another MCP
that can safely bridge to the Mac.

## Components

Run both components on the same trusted machine:

1. Private gateway: `127.0.0.1:3188`
2. MCP HTTP adapter: `127.0.0.1:3100/mcp` (or firewall-restricted equivalent)

Start the gateway:

```bash
python3 server.py
```

Start the MCP HTTP adapter:

```bash
npm run start:mcp:http
```

The health path is `/healthz` and the MCP path is `/mcp`.

## HTTPS and authentication

Put port `3100` behind a reverse proxy or tunnel that provides:

- a valid public TLS certificate;
- authentication compatible with your ChatGPT custom-app configuration;
- an allowlist or access policy where practical;
- request-size, rate, and concurrency limits;
- access logs that redact authorization headers and request bodies.

Register only the final URL:

```text
https://YOUR_MCP_DOMAIN/mcp
```

Never register a `.sh` file or `/Users/...` path as the Server URL.

## ngrok placeholder workflow

This repository intentionally contains no ngrok domain, authtoken, API key, or
MCP credential. Create your own ngrok account, domain, tunnel, and access policy.
After securing the endpoint, point the tunnel at local port `3100` and append
`/mcp` to the generated HTTPS domain when registering it in ChatGPT.

Do not run a public unauthenticated tunnel even for a short test: the MCP tools
can create billed OpenRouter requests. The `NGROK_DOMAIN=` entry in
`.env.example` is only an empty reminder; the application does not consume or
publish it.

## Server-hosted gateway

If the Python gateway must bind beyond loopback, it refuses to start unless
`OPENROUTER_AGENT_TOKEN` is set. Use a long random token and provide the same
value to `mcp-server.mjs` through its process environment. Keep port `3188`
private to the host or container network; bearer authentication does not replace
a firewall and TLS.

## ChatGPT setup

1. Add a custom app/MCP server in the ChatGPT settings available to your plan or
   workspace.
2. Choose the authentication method that matches the protected endpoint.
3. Enter `https://YOUR_MCP_DOMAIN/mcp` as the Server URL.
4. Review the discovered tools and verify that only the three OpenRouter tools
   appear.
5. Add the app to a Custom GPT if your workspace supports apps in GPTs.
6. Paste `docs/chatgpt-agent-instructions.md` into the GPT instructions.
7. Keep the GPT private during testing.

## Before making it public

- Rotate every credential that has ever been pasted into a chat.
- Confirm no filesystem, shell, clipboard, or unrelated Mac tools are exposed.
- Configure OpenRouter budget and rate limits.
- Verify that unknown users cannot reach `/mcp` or `/healthz`.
- Test token revocation and tunnel shutdown.
- Review `SECURITY.md`.
