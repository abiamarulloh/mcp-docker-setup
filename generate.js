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
  mcp: {}
};

for (const [name, server] of Object.entries(source.mcpServers || {})) {
  const containerName = `mcp_${name.replace(/-/g, "_")}`;
  opencode.mcp[name] = {
    type: "local",
    command: `docker exec -i ${containerName} ${server.command} ${server.args.join(" ")}`,
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