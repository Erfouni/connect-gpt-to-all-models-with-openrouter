import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("./mcp-server.mjs", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
});

const client = new Client({ name: "openrouter-router-self-test", version: "1.0.0" });
await client.connect(transport);

try {
  const response = await client.listTools();
  const names = response.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    "openrouter_compare_models",
    "openrouter_list_models",
    "openrouter_run_model",
  ]);
  for (const tool of response.tools) {
    assert.deepEqual(tool._meta?.securitySchemes, [{ type: "noauth" }]);
  }
  console.log(`MCP_OK: ${names.join(", ")}`);
} finally {
  await client.close();
}
