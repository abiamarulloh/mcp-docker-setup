const fs = require("fs");
const path = require("path");

const source = JSON.parse(
  fs.readFileSync("./source.json", "utf8")
);

fs.mkdirSync("./generated", {
  recursive: true
});

fs.writeFileSync(
  "./generated/vscode.json",
  JSON.stringify(
    {
      servers: source
    },
    null,
    2
  )
);

fs.writeFileSync(
  "./generated/claude.json",
  JSON.stringify(
    {
      mcpServers: source
    },
    null,
    2
  )
);

const opencode = {
  $schema: "https://opencode.ai/config.json",
  mcp: {}
};

const containerPathMap = {
  "filesystem-personal": {
    "/Volumes/Data/my-labs": "/data"
  }
};

for (const [name, server] of Object.entries(source.mcpServers || {})) {
  const containerName = `mcp_${name.replace(/-/g, "_")}`;
  const args = (server.args || []).map((arg) => {
    const replacements = containerPathMap[name] || {};
    return replacements[arg] || arg;
  });

  opencode.mcp[name] = {
    type: "local",
    enabled: true,
    command: [
      "docker",
      "exec",
      "-i",
      containerName,
      server.command,
      ...args
    ],
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
      mcpServers: source
    },
    null,
    2
  )
);

console.log("generated");