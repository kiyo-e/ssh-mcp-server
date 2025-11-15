# SSH MCP Server (Bun + Hono)

This project exposes an MCP server that works over both HTTP and stdio. Tools like Claude Code, Cursor, or any MCP-capable agent can open a persistent SSH shell, execute commands, and close the session cleanly. Sessions only live in container memory, so the remote SSH target stays untouched.

## Features

- Bun runtime with the Hono web framework.
- MCP server built using `@modelcontextprotocol/sdk` + `@hono/mcp`.
- `ssh2`-backed persistent sessions with idle cleanup and history suppression.
- Tools: `ssh_open`, `ssh_exec`, `ssh_close`.
- Dual transports: HTTP endpoint (`POST /mcp`) and stdio transport for `type: "command"` clients.

## Project Structure

```
.
├── Dockerfile
├── package.json
├── tsconfig.json
└── src
    ├── index.ts         # Hono HTTP entry + MCP transport
    ├── mcpServer.ts     # MCP tool registration
    ├── sshSessions.ts   # SSH session lifecycle helpers
    └── stdio.ts         # STDIO entry point for command transports
```

## Prerequisites

- Bun v1.1+ (for local development)
- Docker (optional, for containerized deployment)
- SSH credentials for the remote hosts you plan to reach

## Setup

```bash
bun install
```

> If Bun cannot write to your temp directory (common in sandboxed environments), point it to a writable folder: `TMPDIR=$(pwd)/.tmp bun install`.

## Runtime Modes

### HTTP server (default)

```bash
bun run src/index.ts
# or
bun run start:http
```

The server listens on `http://0.0.0.0:3000` by default. Override with `PORT=4000 bun run src/index.ts` as needed.

### STDIO server (for `type: "command"` MCP clients)

```bash
bun run src/stdio.ts
# or
bun run start:stdio
```

This mode keeps all traffic on stdio, which is what Claude Code's Command MCP adapter expects. Point your MCP client at this executable directly, or wrap it in Docker as shown below.

## MCP Client Registration Examples

**HTTP transport**

```json
{
  "servers": {
    "ssh-mcp": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

**STDIO / command transport (Claude Code, Cursor, etc.)**

```json
{
  "servers": {
    "ssh-mcp": {
      "type": "command",
      "command": ["bun", "run", "src/stdio.ts"],
      "env": {
        "SSH_PRIVATE_KEY": "$(cat ~/.ssh/id_rsa)"
      }
    }
  }
}
```

When using Docker, the command array could look like:

```json
{
  "servers": {
    "ssh-mcp": {
      "type": "command",
      "command": [
        "docker", "run", "--rm", "-i",
        "-e", "SSH_PRIVATE_KEY",
        "ssh-mcp-server",
        "bun", "run", "src/stdio.ts"
      ],
      "env": {
        "SSH_PRIVATE_KEY": "$(cat ~/.ssh/id_rsa)"
      }
    }
  }
}
```

The `-e SSH_PRIVATE_KEY` flag tells Docker to forward the env var coming from the MCP client host into the container so the server can authenticate via key-based SSH.

## MCP Tools

| Tool       | Description | Required Inputs |
|------------|-------------|-----------------|
| `ssh_open` | Establishes a session using password or the container's `SSH_PRIVATE_KEY` env var | `host`, `username`, optional `port`, optional `password` |
| `ssh_exec` | Executes a shell command on an existing session | `sessionId`, `command`, optional `timeoutMs` |
| `ssh_close`| Explicitly closes the session | `sessionId` |

## Environment Variables

- `SSH_PRIVATE_KEY`: Private key material to use when `ssh_open` is called without a password.
- `PORT`: HTTP port for the MCP server (defaults to `3000`).

## Docker Usage

```bash
docker build -t ssh-mcp-server .

# HTTP mode
docker run --rm -p 3000:3000 \
  -e SSH_PRIVATE_KEY="$(cat ~/.ssh/id_rsa)" \
  ssh-mcp-server

# STDIO mode (note -i to keep stdin open)
docker run --rm -i \
  -e SSH_PRIVATE_KEY="$(cat ~/.ssh/id_rsa)" \
  ssh-mcp-server \
  bun run src/stdio.ts
```

## Production Notes

- Sessions expire after 30 minutes of inactivity (tunable in `src/sshSessions.ts`).
- Commands stream through a persistent shell, so stateful workflows (e.g., `cd` then `ls`) work within a session.
- Always call `ssh_close` when finished to release resources promptly.
