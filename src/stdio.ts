import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcpServer.js";

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  process.stderr.write("SSH MCP server (stdio) starting...\n");

  await server.connect(transport);

  const shutdown = async () => {
    await server.close();
    await transport.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Fatal error in stdio transport:", error);
  process.exit(1);
});
