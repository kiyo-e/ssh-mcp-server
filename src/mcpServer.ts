import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  openSshSession,
  execInSession,
  closeSshSession
} from "./sshSessions.js";

export function createMcpServer() {
  const server = new McpServer(
    {
      name: "ssh-mcp-server",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.registerTool(
    "ssh_open",
    {
      title: "Open SSH session",
      description:
        "Open a persistent SSH session and return a sessionId for later commands.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: true
      },
      inputSchema: {
        host: z.string().describe("SSH host name or IP address"),
        port: z
          .number()
          .int()
          .min(1)
          .max(65535)
          .optional()
          .describe("SSH port (default 22)"),
        username: z.string().describe("SSH user"),
        password: z
          .string()
          .optional()
          .describe(
            "Password. If omitted, SSH_PRIVATE_KEY env var will be used."
          )
      },
      outputSchema: {
        sessionId: z.string().describe("Identifier of the opened SSH session")
      }
    },
    async ({ host, port, username, password }) => {
      const privateKeyEnv = process.env.SSH_PRIVATE_KEY;
      const sessionId = await openSshSession({
        host,
        port,
        username,
        password,
        privateKey: password ? undefined : privateKeyEnv
      });

      const structuredContent = { sessionId };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(structuredContent)
          }
        ],
        structuredContent
      };
    }
  );

  server.registerTool(
    "ssh_exec",
    {
      title: "Execute command on existing SSH session",
      description:
        "Run a shell command on an existing SSH session created by ssh_open.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: true
      },
      inputSchema: {
        sessionId: z.string().describe("Session ID from ssh_open"),
        command: z.string().describe("Shell command to execute"),
        timeoutMs: z
          .number()
          .int()
          .optional()
          .describe("Timeout in milliseconds (default 60000)")
      },
      outputSchema: {
        stdout: z.string().describe("Combined stdout and stderr output"),
        exitCode: z.number().int().describe("Exit code of the command")
      }
    },
    async ({ sessionId, command, timeoutMs }) => {
      const result = await execInSession(
        sessionId,
        command,
        timeoutMs ?? 60_000
      );

      const structuredContent = {
        stdout: result.stdout,
        exitCode: result.exitCode
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(structuredContent)
          }
        ],
        structuredContent
      };
    }
  );

  server.registerTool(
    "ssh_close",
    {
      title: "Close SSH session",
      description: "Close an existing SSH session.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: true
      },
      inputSchema: {
        sessionId: z.string().describe("Session ID to close")
      },
      outputSchema: {
        closed: z.boolean().describe("Whether the session existed and closed")
      }
    },
    async ({ sessionId }) => {
      const closed = closeSshSession(sessionId);
      const structuredContent = { closed };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(structuredContent)
          }
        ],
        structuredContent
      };
    }
  );

  return server;
}
