# SSH MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/kiyo-e/ssh-mcp-server/pkgs/container/ssh-mcp-server)

A Model Context Protocol (MCP) server that enables AI agents like Claude Code and Cursor to execute commands on remote servers via persistent SSH sessions. Built with Bun and Hono for high performance and ease of deployment.

## Overview

This MCP server provides a secure, stateful SSH interface for AI-powered development tools. It maintains persistent SSH connections in memory, allowing agents to execute commands across sessions without requiring any software installation on remote hosts.

**Key Benefits:**
- **Zero Installation**: No agent software needed on remote servers
- **Stateful Sessions**: Maintain context across multiple commands (e.g., `cd` followed by `ls`)
- **Dual Transport**: Works as both an HTTP service and stdio-based command
- **Secure by Default**: Key-based authentication with automatic session cleanup

## Features

- **Persistent SSH Sessions**: Powered by `ssh2` with automatic idle cleanup after 30 minutes
- **Three Simple Tools**: `ssh_open`, `ssh_exec`, and `ssh_close` for complete session control
- **Flexible Transport**: HTTP endpoint (`POST /mcp`) or stdio for command-based MCP clients
- **Lightweight & Fast**: Built on Bun runtime and Hono web framework
- **Container Ready**: Pre-built Docker images available on GitHub Container Registry

## Quick Start

### Using Docker (Recommended)

Pull the pre-built image:

```bash
docker pull ghcr.io/kiyo-e/ssh-mcp-server:latest
```

Run in stdio mode for MCP clients:

```bash
docker run --rm -i \
  -e SSH_PRIVATE_KEY="$(cat ~/.ssh/id_rsa)" \
  ghcr.io/kiyo-e/ssh-mcp-server:latest \
  bun run src/stdio.ts
```

### Local Development

Install dependencies:

```bash
bun install
```

Start the server:

```bash
# HTTP mode (default port 3000)
bun run start:http

# STDIO mode for command-based MCP clients
bun run start:stdio
```

## MCP Tools

This server exposes three tools for managing SSH sessions:

| Tool        | Description                                              | Parameters                                                        |
|-------------|----------------------------------------------------------|-------------------------------------------------------------------|
| `ssh_open`  | Opens a new SSH session with password or key-based auth  | `host`, `username`, optional `port`, optional `password`          |
| `ssh_exec`  | Executes a command on an existing session                | `sessionId`, `command`, optional `timeoutMs`                      |
| `ssh_close` | Closes an active session and frees resources             | `sessionId`                                                       |

### Example Workflow

```javascript
// 1. Open a session
const session = await ssh_open({
  host: "example.com",
  username: "deploy",
  port: 22
});

// 2. Execute commands (maintains state)
await ssh_exec({ sessionId: session.id, command: "cd /var/www" });
await ssh_exec({ sessionId: session.id, command: "ls -la" });

// 3. Close when done
await ssh_close({ sessionId: session.id });
```

## Configuration

Add this server to your MCP client configuration file.

### For Claude Code / Cursor (Command Transport)

**Using Docker (Recommended):**

```json
{
  "mcpServers": {
    "ssh-mcp": {
      "type": "command",
      "command": [
        "docker",
        "run",
        "--rm",
        "-i",
        "-e",
        "SSH_PRIVATE_KEY",
        "ghcr.io/kiyo-e/ssh-mcp-server:latest",
        "bun",
        "run",
        "src/stdio.ts"
      ],
      "env": {
        "SSH_PRIVATE_KEY": "$(cat ~/.ssh/id_rsa)"
      }
    }
  }
}
```

**Using Local Installation:**

```json
{
  "mcpServers": {
    "ssh-mcp": {
      "type": "command",
      "command": ["bun", "run", "/path/to/ssh-mcp-server/src/stdio.ts"],
      "env": {
        "SSH_PRIVATE_KEY": "$(cat ~/.ssh/id_rsa)"
      }
    }
  }
}
```

### For HTTP Transport

```json
{
  "mcpServers": {
    "ssh-mcp": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Environment Variables

| Variable          | Description                                              | Required |
|-------------------|----------------------------------------------------------|----------|
| `SSH_PRIVATE_KEY` | Private key content for key-based authentication         | No*      |
| `PORT`            | HTTP server port (default: 3000)                         | No       |

*Required if not using password authentication with `ssh_open`

## Advanced Usage

### Custom Port Configuration

```bash
# HTTP mode with custom port
PORT=4000 bun run src/index.ts

# Docker with custom port
docker run --rm -p 4000:4000 \
  -e PORT=4000 \
  -e SSH_PRIVATE_KEY="$(cat ~/.ssh/id_rsa)" \
  ghcr.io/kiyo-e/ssh-mcp-server:latest
```

### Sandboxed Environment Installation

If Bun cannot write to your temp directory (common in sandboxed environments):

```bash
TMPDIR=$(pwd)/.tmp bun install
```

### Building from Source

```bash
# Clone the repository
git clone https://github.com/kiyo-e/ssh-mcp-server.git
cd ssh-mcp-server

# Install dependencies
bun install

# Build Docker image
docker build -t ssh-mcp-server .
```

## Best Practices

- **Session Management**: Always call `ssh_close` when done to free resources immediately
- **Idle Timeout**: Sessions automatically expire after 30 minutes of inactivity
- **Stateful Commands**: Take advantage of persistent shells for multi-step operations (e.g., `cd` then `ls`)
- **Security**: Use key-based authentication when possible; avoid hardcoding passwords

## Requirements

- **Runtime**: Bun v1.1+ (for local development)
- **Container**: Docker (optional but recommended)
- **SSH Access**: Valid credentials for target remote hosts

## Links

- **Repository**: [github.com/kiyo-e/ssh-mcp-server](https://github.com/kiyo-e/ssh-mcp-server)
- **Container Images**: [ghcr.io/kiyo-e/ssh-mcp-server](https://github.com/kiyo-e/ssh-mcp-server/pkgs/container/ssh-mcp-server)
- **Issues**: [Report bugs or request features](https://github.com/kiyo-e/ssh-mcp-server/issues)

## License

MIT License - see [LICENSE](LICENSE) file for details.
