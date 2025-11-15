import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import { createMcpServer } from "./mcpServer.js";

const app = new Hono();

app.get("/", (c) => c.text("SSH MCP server is running. MCP endpoint: POST /mcp"));

app.all("/mcp", async (c) => {
  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPTransport();
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

const port = Number(process.env.PORT ?? 3000);

Bun.serve({
  fetch: app.fetch,
  port
});

console.log(`SSH MCP server listening on http://0.0.0.0:${port}`);
