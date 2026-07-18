# Authenticated Remote MCP / ChatGPT Web

ChatGPT web needs a public HTTPS MCP URL; it cannot execute a file path on your
Mac. This project uses Auth0 as the OAuth 2.1 authorization server, validates
access tokens inside the MCP resource server, and uses ngrok only as the TLS
tunnel.

## Secure topology

```text
ChatGPT -- HTTPS/OAuth --> ngrok --> 127.0.0.1:3200/mcp
                                      |
                                      +--> 127.0.0.1:3188 --> OpenRouter
Auth0 ---- signed tokens + JWKS -------^
```

- `server.py` holds `OPENROUTER_API_KEY` and stays on `127.0.0.1:3188`.
- `remote-mcp-server.mjs` stays on `127.0.0.1:3200`, verifies OAuth access
  tokens, and exposes only the three OpenRouter MCP tools.
- ngrok exposes port `3200`. Never expose port `3188`.

The remote server verifies all of the following before handling an MCP request:

- an RS256 signature from the configured JWKS endpoint;
- exact Auth0 issuer and audience;
- token expiration;
- every scope in `AUTH0_REQUIRED_SCOPES`;
- `AUTH0_ALLOWED_CLIENT_IDS`, when that optional allowlist is configured.

## 1. Choose a stable public URL

Create your own reserved ngrok domain. The examples below use placeholders only:

```text
YOUR_DOMAIN.ngrok.app
https://YOUR_DOMAIN.ngrok.app/mcp
```

The `/mcp` URL must remain stable because it is both the protected resource and
the Auth0 API audience.

Configure ngrok's authtoken only in ngrok's local configuration, never in this
repository or `.env`:

```bash
ngrok config add-authtoken YOUR_OWN_TOKEN
```

## 2. Configure Auth0

Use the current Auth0 flow from OpenAI's authenticated MCP server scaffold. In
your own Auth0 tenant:

1. Create an API/resource server.
2. Set its identifier/audience to the exact public MCP URL, including `/mcp`:

   ```text
   https://YOUR_DOMAIN.ngrok.app/mcp
   ```

3. Use RS256 signing.
4. Add the permission/scope `models:invoke`.
5. Configure which users and clients may receive that scope. Do not grant it to
   every tenant user unless that is intentional.
6. Configure the ChatGPT OAuth client using the current Auth0/OpenAI scaffold
   instructions. ChatGPT may use Client ID Metadata Documents (CIMD), dynamic
   registration, or a predefined client depending on the current workspace and
   identity-provider configuration.

Do not build a password or token-issuing system inside this project. Auth0 owns
login, consent, client registration, token issuance, and revocation; this MCP
server is only the protected resource.

Official references:

- [OpenAI Apps SDK authentication](https://developers.openai.com/apps-sdk/build/auth)
- [OpenAI authenticated MCP scaffold](https://github.com/openai/openai-mcpkit/tree/main/python-authenticated-mcp-server-scaffold)
- [MCP authorization specification](https://modelcontextprotocol.io/specification/latest/basic/authorization)

## 3. Configure the local `.env`

```bash
cp .env.example .env
```

Set your own values. This example intentionally contains no live domain or
credential:

```dotenv
OPENROUTER_API_KEY=

PUBLIC_MCP_URL=https://YOUR_DOMAIN.ngrok.app/mcp
AUTH0_ISSUER=https://YOUR_TENANT.auth0.com/
AUTH0_AUDIENCE=https://YOUR_DOMAIN.ngrok.app/mcp
AUTH0_JWKS_URL=
AUTH0_REQUIRED_SCOPES=models:invoke
AUTH0_ALLOWED_CLIENT_IDS=

MCP_HTTP_HOST=127.0.0.1
MCP_HTTP_PORT=3200
NGROK_DOMAIN=YOUR_DOMAIN.ngrok.app
```

`AUTH0_JWKS_URL` may stay blank; the server then derives
`.well-known/jwks.json` from `AUTH0_ISSUER`. Use
`AUTH0_ALLOWED_CLIENT_IDS` as a comma- or space-separated allowlist only after
you know the client ID issued for your ChatGPT connection.

The server refuses to start if:

- a required OAuth value is blank;
- either public/Auth0 URL is not HTTPS;
- `AUTH0_AUDIENCE` differs from `PUBLIC_MCP_URL`;
- the public path is not exactly `/mcp`;
- the local MCP host is not loopback.

## 4. Start the three layers

Install dependencies once:

```bash
npm install
chmod +x scripts/*.sh
```

Terminal 1 — private OpenRouter gateway:

```bash
python3 server.py
```

Terminal 2 — OAuth-protected remote MCP:

```bash
./scripts/start-http-mcp.sh
```

Terminal 3 — public TLS tunnel:

```bash
./scripts/start-secure-ngrok.sh
```

The ngrok script reads only the hostname and local port from `.env`; the ngrok
authtoken remains in ngrok's own local configuration.

## 5. Verify before connecting ChatGPT

Metadata and health are intentionally public and contain no secret:

```bash
curl https://YOUR_DOMAIN.ngrok.app/.well-known/oauth-protected-resource/mcp
curl https://YOUR_DOMAIN.ngrok.app/healthz
```

An MCP request without a bearer token must return `401` and a
`WWW-Authenticate` header containing `resource_metadata`:

```bash
curl -i -X POST https://YOUR_DOMAIN.ngrok.app/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

Do not proceed if that request reaches an MCP tool or returns a successful MCP
response.

Run the local no-cost test suite too:

```bash
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m py_compile server.py
npm audit
```

## 6. Add the MCP app to ChatGPT

1. Open the custom app/MCP settings available to your ChatGPT plan or workspace.
2. Enter `https://YOUR_DOMAIN.ngrok.app/mcp` as the **Server URL**.
3. Choose **OAuth** authentication. Do not select “No authentication.”
4. Complete the Auth0 login/consent flow.
5. Review discovery and confirm that exactly these tools appear:
   - `openrouter_list_models`
   - `openrouter_run_model`
   - `openrouter_compare_models`
6. Paste `docs/chatgpt-agent-instructions.md` into your Custom GPT/agent
   instructions and enable the connected MCP app.
7. Keep the GPT private while testing.
8. Ask: `Ask Gemini to reply with exactly MODEL_OK.`
9. Confirm that the returned result contains a real `model_used` value.

## What not to use as ChatGPT authentication

- A local `.sh` path or `/Users/...` path is not a Server URL.
- A static API key/custom bearer token is not the ChatGPT MCP OAuth flow.
- ngrok Basic Auth or ngrok's browser-cookie OAuth layer does not replace MCP
  protected-resource metadata and bearer-token validation.
- An ngrok authtoken authenticates the local ngrok agent to ngrok; it does not
  authorize ChatGPT users to call your MCP tools.

## Shutdown and incident response

Stop ngrok first, then the MCP server, then the private gateway. If any key,
token, domain credential, or authorization header appears in chat, screenshots,
logs, or Git history, revoke/rotate it immediately and inspect Auth0, ngrok, and
OpenRouter logs before restarting.
