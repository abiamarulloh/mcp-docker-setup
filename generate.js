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

fs.writeFileSync(
  "./generated/opencode.json",
  JSON.stringify(
    {
      mcpServers: source
    },
    null,
    2
  )
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