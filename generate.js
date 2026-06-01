const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(".");

const source = JSON.parse(
  fs.readFileSync("./source.json", "utf8")
);

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const parsed = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (val) parsed[key] = val;
  }
  return parsed;
}

const env = readEnv("./.env");

function resolveVar(str) {
  return str.replace(/\$\{([^}]+)\}/g, (_, name) => {
    if (name === "PROJECT_ROOT") return PROJECT_ROOT;
    return env[name] || "";
  });
}

function resolveArgs(args) {
  return (args || []).map(a => resolveVar(a)).filter(a => a !== "");
}

function buildContainerPathMap() {
  const compose = fs.readFileSync("./docker-compose.yml", "utf8");
  const map = {};
  let currentService = null;
  let inVolumes = false;

  for (const line of compose.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const serviceMatch = line.match(/^  ([a-zA-Z0-9_-]+):$/);
    if (serviceMatch) {
      currentService = serviceMatch[1];
      inVolumes = false;
      continue;
    }

    if (line.match(/^    volumes:$/)) {
      inVolumes = true;
      continue;
    }

    if (inVolumes && currentService && trimmed.startsWith("- ")) {
      const vol = trimmed.slice(2);
      const parts = vol.split(":");
      let hostParts = [];
      let containerPath = null;
      let foundContainer = false;
      for (const part of parts) {
        if (!foundContainer && part.startsWith("/")) {
          containerPath = part;
          foundContainer = true;
        } else if (!foundContainer) {
          hostParts.push(part);
        }
      }
      if (containerPath) {
        let host = hostParts.join(":");
        const envRef = host.match(/^\$\{(\w+)(?::-([^}]*))?\}$/);
        if (envRef) {
          host = env[envRef[1]] || envRef[2] || "";
        }
        if (!host.startsWith("/") || host === "/tmp") continue;
        if (!map[currentService]) map[currentService] = {};
        map[currentService][host] = containerPath;
      }
      continue;
    }

    if (inVolumes && currentService) {
      inVolumes = false;
    }
  }

  return map;
}

const containerPathMap = buildContainerPathMap();

for (const name of Object.keys(source.mcpServers || {})) {
  if (!containerPathMap[name]) containerPathMap[name] = {};
  containerPathMap[name][PROJECT_ROOT] = "/workspace";
}

function buildDockerCommand(name, server) {
  const containerName = `mcp_${name.replace(/-/g, "_")}`;
  const resolved = resolveArgs(server.args);
  const args = resolved.map((arg) => {
    const replacements = containerPathMap[name] || {};
    for (const [hostPath, containerPath] of Object.entries(replacements)) {
      if (arg.startsWith(hostPath)) {
        return arg.replace(hostPath, containerPath);
      }
    }
    return arg;
  });

  const command = ["docker", "exec", "-i"];

  if (server.env) {
    for (const key of Object.keys(server.env)) {
      command.push("-e", key);
    }
  }

  command.push(containerName, server.command, ...args);
  return command;
}

fs.mkdirSync("./generated", { recursive: true });

const dockerServers = {};
for (const [name, server] of Object.entries(source.mcpServers || {})) {
  const cmd = buildDockerCommand(name, server);
  dockerServers[name] = {
    command: cmd[0],
    args: cmd.slice(1),
    env: server.env || undefined,
  };
}

const vscodeServers = {};
for (const [name, server] of Object.entries(source.mcpServers || {})) {
  const cmd = buildDockerCommand(name, server);
  vscodeServers[name] = {
    command: cmd[0],
    args: cmd.slice(1),
    type: "stdio",
    env: server.env || undefined,
  };
}

fs.writeFileSync(
  "./generated/vscode.json",
  JSON.stringify({ servers: vscodeServers }, null, 2)
);

fs.writeFileSync(
  "./generated/claude.json",
  JSON.stringify({ mcpServers: dockerServers }, null, 2)
);

fs.writeFileSync(
  "./generated/kiro.json",
  JSON.stringify({ mcpServers: dockerServers }, null, 2)
);

fs.writeFileSync(
  "./generated/trae.json",
  JSON.stringify({ mcpServers: dockerServers }, null, 2)
);

const opencode = {
  $schema: "https://opencode.ai/config.json",
  mcp: {},
};

for (const [name, server] of Object.entries(source.mcpServers || {})) {
  const cmd = buildDockerCommand(name, server);
  opencode.mcp[name] = {
    type: "local",
    enabled: true,
    command: cmd,
    env: server.env || undefined,
  };
}

fs.writeFileSync(
  "./generated/opencode.json",
  JSON.stringify(opencode, null, 2)
);

console.log("generated");
