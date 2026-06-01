# MCP Docker Setup

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/abiamarulloh/mcp-docker-setup/actions/workflows/ci.yml/badge.svg)](https://github.com/abiamarulloh/mcp-docker-setup/actions/workflows/ci.yml)

One-command Docker-based [MCP](https://modelcontextprotocol.io) server setup with auto-generated configs for all major AI coding clients.

```bash
npx mcp-docker-setup init
```

## Quick Start

```bash
# Run the interactive setup wizard
npx mcp-docker-setup init
```

This will:
1. Check prerequisites (Docker, Node.js)
2. Create `.env` from `.env.example`
3. Prompt to edit `.env` with your API keys
4. Generate client configuration files
5. Offer to symlink configs into client app directories
6. Start Docker containers

## Architecture

```
Clients (VS Code, Claude, OpenCode, Trae, Kiro)
  │  docker exec -i <container> <command>
  ▼
Docker Containers (node:20-alpine)
  │  npx -y <mcp-server-package>
  ▼
MCP Servers (Context7, GitHub, Jira, Slack, Filesystem)
```

All communication uses `docker exec -i` — no ports are exposed. Each server runs in an isolated container with `sleep infinity` and is only activated when a client sends a command.

## CLI Reference

```
Usage: npx mcp-docker-setup <command>

Commands:
  init       Interactive setup wizard (first-time setup)
  start      Start Docker Compose services
  stop       Stop Docker Compose services
  status     Show container status
  generate   Generate client configuration files
  ui         Launch web UI at http://localhost:3456
  logs       Tail Docker Compose logs
  help       Show this help message
```

## Available Servers

| Server | Package | Required Env Vars |
|---|---|---|
| Context7 | `@upstash/context7-mcp` | `CONTEXT7_API_KEY` |
| GitHub | `@modelcontextprotocol/server-github` | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| Filesystem | `@modelcontextprotocol/server-filesystem` | `FILESYSTEM_PATH` |
| Jira | `@tarasrushchak/jira-mcp-server` | `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |
| Slack | `@modelcontextprotocol/server-slack` | `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` |

## Manual Setup

If you prefer not to use the CLI wizard:

```bash
git clone https://github.com/abiamarulloh/mcp-docker-setup.git
cd mcp-docker-setup
cp .env.example .env
# Edit .env with your API keys
npm run generate
npm run start:mcp
```

## Web UI

Launch a browser-based env var manager and connection tester:

```bash
npx mcp-docker-setup ui
# or
npm run ui
```

Opens at `http://localhost:3456`. Features:
- Edit environment variables per server
- Test connections (GitHub, Jira, Slack, Context7, Filesystem)
- Toggle servers on/off
- Auto-generates configs on save

## Client Configuration

After running `npm run generate`, config files are created in `generated/`. Link them to your clients:

### VS Code (macOS)
```bash
ln -sf "$PWD/generated/vscode.json" "$HOME/Library/Application Support/Code/User/mcp.json"
```

### Claude Desktop (macOS)
```bash
ln -sf "$PWD/generated/claude.json" "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
```

### OpenCode
```bash
ln -sf "$PWD/generated/opencode.json" "$HOME/.config/opencode/opencode.json"
```

### Trae (macOS)
```bash
ln -sf "$PWD/generated/trae.json" "$HOME/Library/Application Support/Trae/User/mcp.json"
```

### Kiro
```bash
ln -sf "$PWD/generated/kiro.json" "$HOME/.kiro/settings/mcp.json"
```

Restart the client after creating the symlink.

## How It Works

1. **`docker-compose.yml`** — Defines `node:20-alpine` containers for each server, all running `sleep infinity` and reading env vars from `.env`
2. **`source.json`** — Source of truth mapping server names to commands, args, and env var references (`${VAR_NAME}`)
3. **`generate.js`** — Reads `source.json`, resolves env vars, applies format transformations for each client, produces files in `generated/`
4. **Container path mapping** — Generates `docker exec` commands for OpenCode and Trae that translate host paths to container paths using volume mappings from `docker-compose.yml`

### Adding a New Server

1. Add a service to `docker-compose.yml`
2. Add an entry to `source.json`:
```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@org/my-mcp-server"],
      "env": {
        "MY_API_KEY": "${MY_API_KEY}"
      }
    }
  }
}
```
3. Add defaults to `.env.example`
4. Run `npm run generate`

## Docker Management

```bash
npm run start:mcp    # Start all containers
npm run stop:mcp     # Stop all containers
npm run status:mcp   # Check container health
npm run logs:mcp     # Follow logs
```

## Environment Variables

See `.env.example` for all available variables and their descriptions.

## Troubleshooting

| Issue | Solution |
|---|---|
| "Not connected" in client | Run `npm run status:mcp` — check all containers are healthy |
| FILESYSTEM_PATH not found | Set the path in `.env` — the server needs it as a CLI argument |
| Container won't start | `npm run logs:mcp` to see errors; check env vars are set |
| Port conflicts | No ports are exposed — all communication uses `docker exec -i` |
| Generated configs outdated | Run `npm run generate` after changing `source.json` |

## License

MIT
