# MCP Setup

This repository contains MCP configuration for local development using Docker Compose.

## What is included

- `docker-compose.yml` – defines MCP services:
  - `context7`
  - `filesystem-personal`
  - `github-personal`
- `docker-compose.override.yml` – development override with `tty` and `stdin_open`
- `package.json` – convenient npm wrappers for Docker Compose commands
- `.env` – environment variables used by the containers
- `generate.js` and `source.json` – source configuration used to generate MCP config files
- `generated/` – generated client config files such as `claude.json`, `kiro.json`, `opencode.json`, and `vscode.json`

## Prerequisites

- Docker Desktop / Docker Engine installed
- `docker compose` available in your shell
- A valid `GITHUB_PERSONAL_TOKEN` in `.env` if you want the GitHub MCP server to run
- Copy `.env.example` to `.env` and fill in your values before starting

## Usage

Before starting MCP, generate the client configuration files once:

```bash
npm run generate
```

That command creates the generated config files used by clients such as `claude.json`, `kiro.json`, `opencode.json`, and `vscode.json`.

Then run MCP from the project root (`~/.mcp`):

```bash
npm run start:mcp
npm run status:mcp
npm run logs:mcp
npm run stop:mcp
```

## Client config symlink tutorial

After running `npm run generate`, you can symlink the generated client config into your VS Code and MCP client locations.

Common symlink commands on macOS and Linux:

```bash
ln -sf ~/.mcp/generated/vscode.json "$HOME/Library/Application Support/Code/User/mcp.json"
ln -sf ~/.mcp/generated/claude.json "$HOME/Library/Application Support/Code/User/mcp.claude.json"
ln -sf ~/.mcp/generated/kiro.json "$HOME/Library/Application Support/Code/User/mcp.kiro.json"
ln -sf ~/.mcp/generated/opencode.json "$HOME/Library/Application Support/Code/User/mcp.opencode.json"
```

For Linux, the target path may differ depending on your VS Code install. Common paths include:

```bash
ln -sf ~/.mcp/generated/vscode.json "$HOME/.config/Code/User/mcp.json"
ln -sf ~/.mcp/generated/claude.json "$HOME/.config/Code/User/mcp.claude.json"
ln -sf ~/.mcp/generated/kiro.json "$HOME/.config/Code/User/mcp.kiro.json"
ln -sf ~/.mcp/generated/opencode.json "$HOME/.config/Code/User/mcp.opencode.json"
```

For Windows PowerShell, use `New-Item -ItemType SymbolicLink` and adjust the source path if necessary:

```powershell
New-Item -ItemType SymbolicLink -Path "$HOME\AppData\Roaming\Code\User\mcp.json" -Target "C:\Users\<user>\.mcp\generated\vscode.json"
New-Item -ItemType SymbolicLink -Path "$HOME\AppData\Roaming\Code\User\mcp.claude.json" -Target "C:\Users\<user>\.mcp\generated\claude.json"
New-Item -ItemType SymbolicLink -Path "$HOME\AppData\Roaming\Code\User\mcp.kiro.json" -Target "C:\Users\<user>\.mcp\generated\kiro.json"
New-Item -ItemType SymbolicLink -Path "$HOME\AppData\Roaming\Code\User\mcp.opencode.json" -Target "C:\Users\<user>\.mcp\generated\opencode.json"
```

If symlinks are not available on Windows, you can copy the files instead:

```powershell
Copy-Item "$HOME\.mcp\generated\vscode.json" "$HOME\AppData\Roaming\Code\User\mcp.json"
```

If your client expects a different path, replace the destination path accordingly.

Once the symlinks are created, restart VS Code or the client so it re-reads the MCP configuration.

Or directly with Docker Compose:

```bash
docker compose up -d
docker compose ps
docker compose logs -f
docker compose down
```

## Notes

- The `start:mcp`, `stop:mcp`, and `status:mcp` scripts are wrappers around Docker Compose and provide a more intuitive experience.
- `docker-compose.override.yml` is automatically applied by Docker Compose.
- Keep `.env` private and do not commit secrets like `GITHUB_PERSONAL_TOKEN` to version control.
- A `.gitignore` file is included to ignore local secrets and editor artifacts.

## Troubleshooting

- If `docker compose` warns about obsolete `version`, the Compose files are already updated and the warning should no longer appear.
- If `github-personal` does not start, check that `GITHUB_PERSONAL_TOKEN` is set in `.env`.
- Use `docker compose ps` to verify which services are running.
