import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import express from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { pathToFileURL } from "node:url";

import { createOpenRouterMcpServer } from "./mcp-server.mjs";

const DEFAULT_SCOPE = "models:invoke";
const DOCUMENTATION_URL =
  "https://github.com/Erfouni/connect-gpt-to-all-models-with-openrouter/blob/main/SECURITY.md";

export function parseScopes(value = DEFAULT_SCOPE) {
  return String(value)
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function tokenScopes(payload) {
  const values = [];
  if (typeof payload.scope === "string") values.push(...parseScopes(payload.scope));
  if (typeof payload.scp === "string") values.push(...parseScopes(payload.scp));
  if (Array.isArray(payload.scp)) values.push(...payload.scp);
  if (Array.isArray(payload.permissions)) values.push(...payload.permissions);
  return [...new Set(values.filter((value) => typeof value === "string" && value))];
}

function required(name, value) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${name} is required for remote OAuth mode`);
  return result;
}

function httpsUrl(name, value) {
  const url = new URL(required(name, value));
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS`);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must not include credentials, a query, or a fragment`);
  }
  return url;
}

function normalizeIssuer(value) {
  const issuer = httpsUrl("AUTH0_ISSUER", value);
  if (!issuer.pathname.endsWith("/")) issuer.pathname += "/";
  return issuer.href;
}

export function loadRemoteConfig(env = process.env) {
  const publicMcpUrl = httpsUrl("PUBLIC_MCP_URL", env.PUBLIC_MCP_URL);
  if (publicMcpUrl.pathname !== "/mcp") {
    throw new Error("PUBLIC_MCP_URL must end with the exact path /mcp");
  }

  const audience = required("AUTH0_AUDIENCE", env.AUTH0_AUDIENCE);
  if (audience !== publicMcpUrl.href) {
    throw new Error("AUTH0_AUDIENCE must exactly match PUBLIC_MCP_URL");
  }

  const host = String(env.MCP_HTTP_HOST ?? "127.0.0.1").trim();
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("MCP_HTTP_HOST must be loopback; expose it only through the HTTPS tunnel");
  }

  const port = Number.parseInt(env.MCP_HTTP_PORT ?? "3200", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MCP_HTTP_PORT must be an integer from 1 to 65535");
  }

  const issuer = normalizeIssuer(env.AUTH0_ISSUER);
  const jwksUrl = env.AUTH0_JWKS_URL
    ? httpsUrl("AUTH0_JWKS_URL", env.AUTH0_JWKS_URL).href
    : new URL(".well-known/jwks.json", issuer).href;
  const requiredScopes = parseScopes(env.AUTH0_REQUIRED_SCOPES);
  if (requiredScopes.length === 0) {
    throw new Error("AUTH0_REQUIRED_SCOPES must include at least one scope");
  }

  return {
    publicMcpUrl: publicMcpUrl.href,
    publicHostname: publicMcpUrl.hostname.toLowerCase(),
    issuer,
    audience,
    jwksUrl,
    requiredScopes,
    allowedClientIds: parseScopes(env.AUTH0_ALLOWED_CLIENT_IDS ?? ""),
    host,
    port,
  };
}

export function protectedResourceMetadata(config) {
  return {
    resource: config.audience,
    authorization_servers: [config.issuer],
    scopes_supported: config.requiredScopes,
    bearer_methods_supported: ["header"],
    resource_name: "OpenRouter model orchestrator",
    resource_documentation: DOCUMENTATION_URL,
  };
}

export function createAuth0Verifier(config, keySet) {
  const jwks = keySet ?? createRemoteJWKSet(new URL(config.jwksUrl));

  return {
    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer: config.issuer,
          audience: config.audience,
          algorithms: ["RS256"],
        });
        if (typeof payload.exp !== "number") {
          throw new Error("Missing expiration");
        }

        const clientId = String(payload.client_id ?? payload.azp ?? "");
        if (!clientId) throw new Error("Missing client identifier");
        if (
          config.allowedClientIds.length > 0 &&
          !config.allowedClientIds.includes(clientId)
        ) {
          throw new Error("Client is not allowed");
        }

        return {
          token,
          clientId,
          scopes: tokenScopes(payload),
          expiresAt: payload.exp,
          resource: new URL(config.audience),
          extra: { subject: payload.sub },
        };
      } catch {
        throw new InvalidTokenError("Invalid access token");
      }
    },
  };
}

function hostnameFromHeader(value) {
  try {
    return new URL(`http://${value}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function jsonRpcError(res, status, message) {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

export function createRemoteMcpApp(config, verifier = createAuth0Verifier(config)) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    const hostname = hostnameFromHeader(req.headers.host ?? "");
    const allowed = new Set([config.publicHostname, "127.0.0.1", "localhost", "[::1]", "::1"]);
    if (!allowed.has(hostname)) return res.status(421).json({ error: "Unrecognized Host header" });
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "no-referrer");
    res.set("Cache-Control", "no-store");
    next();
  });

  const metadata = protectedResourceMetadata(config);
  app.get("/.well-known/oauth-protected-resource", (_req, res) => res.json(metadata));
  app.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => res.json(metadata));
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  const resourceMetadataUrl = new URL(
    "/.well-known/oauth-protected-resource/mcp",
    config.publicMcpUrl,
  ).href;
  const bearerAuth = requireBearerAuth({
    verifier,
    requiredScopes: config.requiredScopes,
    resourceMetadataUrl,
  });

  app.use("/mcp", bearerAuth);
  app.post("/mcp", async (req, res) => {
    const mcpServer = createOpenRouterMcpServer({
      authentication: "oauth",
      requiredScopes: config.requiredScopes,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      await transport.close().catch(() => {});
      await mcpServer.close().catch(() => {});
    };
    res.on("close", close);

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) jsonRpcError(res, 500, "Internal MCP error");
      await close();
    }
  });
  app.get("/mcp", (_req, res) => jsonRpcError(res, 405, "Method not allowed"));
  app.delete("/mcp", (_req, res) => jsonRpcError(res, 405, "Method not allowed"));
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    const status = error?.type === "entity.too.large" ? 413 : 400;
    res.status(status).json({ error: status === 413 ? "Request body too large" : "Invalid request" });
  });

  return app;
}

export function startRemoteMcpServer(config = loadRemoteConfig()) {
  const app = createRemoteMcpApp(config);
  const httpServer = app.listen(config.port, config.host, () => {
    console.log(`Authenticated MCP listening at http://${config.host}:${config.port}/mcp`);
  });
  return httpServer;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const httpServer = startRemoteMcpServer();
  const stop = () => httpServer.close(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
