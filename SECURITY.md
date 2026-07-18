# Security Policy

This project bridges ChatGPT to a billed third-party API. Treat its endpoints as
sensitive infrastructure even if the tools only return text.

## Never commit

- `.env`
- OpenRouter keys
- MCP bearer tokens
- ngrok/cloud tunnel authtokens or reserved domains
- OAuth client secrets
- cookies, session tokens, or authorization headers
- personal filesystem paths or logs containing prompts

Only placeholders belong in `.env.example`.

## Deployment rules

1. Keep the Python gateway on loopback. If that is impossible, use a strong
   `OPENROUTER_AGENT_TOKEN`, a private network, and a firewall.
2. Never expose gateway port `3188` directly to the internet.
3. Keep `remote-mcp-server.mjs` on loopback and expose only port `3200` through
   the HTTPS tunnel. Never tunnel the OpenRouter gateway on port `3188`.
4. Use OAuth 2.1-compatible bearer tokens from an established identity provider
   such as Auth0. The remote MCP must verify signature, issuer, audience,
   expiration, scope, and (when configured) client ID.
5. Keep OAuth protected-resource metadata enabled at
   `/.well-known/oauth-protected-resource/mcp`. Test that unauthenticated MCP
   requests return `401` plus a `WWW-Authenticate` challenge.
6. Do not combine this public endpoint with general shell or filesystem access.
7. Apply per-user rate limits, OpenRouter budget limits, and model allowlists if
   other people can use the GPT.
8. Redact prompts and credentials from logs. Disable body logging at proxies.
9. Send external models only the minimum required context.
10. Treat model output and retrieved content as untrusted. It can contain prompt
   injection or unsafe instructions.
11. Require normal host-side confirmation before file changes, messages,
   purchases, deletion, or other consequential actions.

ngrok's agent authtoken belongs only in ngrok's local configuration. ngrok
Basic Auth or browser-session OAuth is not a replacement for the MCP OAuth
resource-server flow used by ChatGPT.

## Credential incident response

If a key or token appears in chat, a screenshot, terminal output, a tunnel URL,
or Git history:

1. Revoke/rotate it immediately at the provider.
2. Stop the tunnel and MCP service.
3. Inspect provider usage and access logs.
4. Remove the secret from the current tree and Git history if it was committed.
5. Create a new least-privilege credential and lower its limits.
6. Restart services and verify that the old credential no longer works.

Deleting a chat message or Git commit is not a substitute for rotation.

## Reporting

Open a private security advisory in the GitHub repository. Do not include a live
credential in the report.
