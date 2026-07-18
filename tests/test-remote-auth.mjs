import assert from "node:assert/strict";
import { once } from "node:events";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from "jose";

import {
  createAuth0Verifier,
  createRemoteMcpApp,
  loadRemoteConfig,
  protectedResourceMetadata,
  tokenScopes,
} from "../remote-mcp-server.mjs";

const config = loadRemoteConfig({
  PUBLIC_MCP_URL: "https://mcp.example.invalid/mcp",
  AUTH0_ISSUER: "https://tenant.example.invalid/",
  AUTH0_AUDIENCE: "https://mcp.example.invalid/mcp",
  AUTH0_JWKS_URL: "https://tenant.example.invalid/.well-known/jwks.json",
  AUTH0_REQUIRED_SCOPES: "models:invoke",
  MCP_HTTP_HOST: "127.0.0.1",
  MCP_HTTP_PORT: "3200",
});

assert.deepEqual(tokenScopes({ scope: "a b", permissions: ["b", "c"] }), ["a", "b", "c"]);
assert.equal(protectedResourceMetadata(config).resource, config.audience);
assert.throws(
  () => loadRemoteConfig({ ...process.env, PUBLIC_MCP_URL: "http://localhost/mcp" }),
  /HTTPS/,
);

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
jwk.kid = "test-key";
jwk.alg = "RS256";
jwk.use = "sig";
const verifier = createAuth0Verifier(config, createLocalJWKSet({ keys: [jwk] }));

async function makeToken(audience = config.audience) {
  return new SignJWT({ scope: "models:invoke", azp: "chatgpt-test", sub: "user-test" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(config.issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

const authInfo = await verifier.verifyAccessToken(await makeToken());
assert.equal(authInfo.clientId, "chatgpt-test");
assert.deepEqual(authInfo.scopes, ["models:invoke"]);
await assert.rejects(async () =>
  verifier.verifyAccessToken(await makeToken("https://wrong.example/mcp")),
);

const fakeVerifier = {
  async verifyAccessToken(token) {
    if (token !== "valid-test-token") throw new Error("invalid");
    return {
      token,
      clientId: "chatgpt-test",
      scopes: ["models:invoke"],
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      resource: new URL(config.audience),
    };
  },
};

const app = createRemoteMcpApp(config, fakeVerifier);
const httpServer = app.listen(0, "127.0.0.1");
await once(httpServer, "listening");
const address = httpServer.address();
assert(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const metadataResponse = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`);
  assert.equal(metadataResponse.status, 200);
  assert.equal((await metadataResponse.json()).resource, config.audience);

  const unauthenticated = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  assert.equal(unauthenticated.status, 401);
  assert.match(
    unauthenticated.headers.get("www-authenticate") ?? "",
    /resource_metadata="https:\/\/mcp\.example\.invalid\/\.well-known\/oauth-protected-resource\/mcp"/,
  );

  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: "Bearer valid-test-token" } },
  });
  const client = new Client({ name: "remote-auth-test", version: "1.0.0" });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 3);
    for (const tool of tools.tools) {
      assert.deepEqual(tool._meta?.securitySchemes, [
        { type: "oauth2", scopes: ["models:invoke"] },
      ]);
    }
  } finally {
    await client.close();
  }
} finally {
  httpServer.closeAllConnections();
  await new Promise((resolve) => httpServer.close(resolve));
}

console.log("REMOTE_AUTH_OK");
