const fs = require("fs");
const path = require("path");

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
  return str.replace(/\$\{([^}]+)\}/g, (_, name) => env[name] || "");
}

function resolveArgs(args) {
  return (args || []).map(a => resolveVar(a)).filter(a => a !== "");
}

const resolvedSource = { mcpServers: {} };
for (const [name, server] of Object.entries(source.mcpServers || {})) {
  resolvedSource.mcpServers[name] = {
    ...server,
    args: resolveArgs(server.args)
  };
}

fs.mkdirSync("./generated", {
  recursive: true
});

const vscodeServers = Object.fromEntries(
  Object.entries(resolvedSource.mcpServers || {}).map(([name, server]) => [
    name,
    { ...server, type: "stdio" }
  ])
);
fs.writeFileSync(
  "./generated/vscode.json",
  JSON.stringify(
    {
      servers: vscodeServers
    },
    null,
    2
  )
);

fs.writeFileSync(
  "./generated/claude.json",
  JSON.stringify(
    {
      mcpServers: resolvedSource.mcpServers
    },
    null,
    2
  )
);

const opencode = {
  $schema: "https://opencode.ai/config.json",
  mcp: {}
};

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
      const parts = trimmed.slice(2).split(":");
      if (parts.length >= 2) {
        let host = parts[0];
        const container = parts[1];
        const envRef = host.match(/^\$\{(\w+)(?::-([^}]*))?\}$/);
        if (envRef) {
          host = env[envRef[1]] || envRef[2] || "";
        }
        if (!host.startsWith("/") || host === "/tmp") continue;
        if (!map[currentService]) map[currentService] = {};
        map[currentService][host] = container;
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

for (const [name, server] of Object.entries(source.mcpServers || {})) {
  const containerName = `mcp_${name.replace(/-/g, "_")}`;
  const resolved = resolveArgs(server.args);
  const args = resolved.map((arg) => {
    const replacements = containerPathMap[name] || {};
    return replacements[arg] || arg;
  });

  const command = ["docker", "exec", "-i"];

  if (server.env) {
    for (const key of Object.keys(server.env)) {
      command.push("-e", key);
    }
  }

  command.push(containerName, server.command, ...args);

  opencode.mcp[name] = {
    type: "local",
    enabled: true,
    command: command,
    env: server.env || undefined
  };
}

fs.writeFileSync(
  "./generated/opencode.json",
  JSON.stringify(opencode, null, 2)
);

fs.writeFileSync(
  "./generated/kiro.json",
  JSON.stringify(
    {
      mcpServers: resolvedSource.mcpServers
    },
    null,
    2
  )
);

fs.writeFileSync(
  "./generated/trae.json",
  JSON.stringify(
    {
      mcpServers: resolvedSource.mcpServers || {}
    },
    null,
    2
  )
);

console.log("generated");