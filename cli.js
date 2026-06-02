#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const readline = require("readline");

const ROOT = __dirname;

function rl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(q) {
  return new Promise((r) => {
    const i = rl();
    i.question(q, (a) => { i.close(); r(a.trim()); });
  });
}

function cmd(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: "inherit", cwd: ROOT, ...opts });
    p.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${bin} exited with code ${code}`)));
    p.on("error", reject);
  });
}

function has(cmd) {
  try { execSync(`which ${cmd} 2>/dev/null || command -v ${cmd} 2>/dev/null`, { stdio: "pipe" }); return true; }
  catch { return false; }
}

function print(s) { process.stdout.write(s); }
function println(s) { console.log(s); }

async function cmdInit() {
  println("");
  println("  ╔══════════════════════════════════════════╗");
  println("  ║       MCP Docker Setup — Init            ║");
  println("  ╚══════════════════════════════════════════╝");
  println("");

  if (!has("docker")) { println("  ✖ Docker not found. Install Docker Desktop first."); process.exit(1); }
  if (!has("node")) { println("  ✖ Node.js not found."); process.exit(1); }

  try { execSync("docker compose version", { stdio: "pipe" }); }
  catch { println("  ✖ docker compose plugin not available."); process.exit(1); }

  println("  ✔ Docker + Node.js detected");

  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    const example = path.join(ROOT, ".env.example");
    if (fs.existsSync(example)) {
      fs.copyFileSync(example, envPath);
      println("  ✔ Created .env from .env.example");
    }
  } else {
    println("  ✔ .env already exists");
  }

  println("");
  println("  ─── Configure your API keys via the web UI ───");
  println("  Run: npm run ui  or  npx mcp-docker-setup ui");
  println("");

  println("");
  print("  Generating client configs... ");
  try {
    execSync("node ./generate.js", { cwd: ROOT, stdio: "pipe" });
    println("✔");
  } catch (e) {
    println("✖");
    println("  Error: " + e.stderr?.toString() || e.message);
    process.exit(1);
  }

  println("");
  await cmdInitSymlinks();

  println("");
  println("  ─── Starting Docker containers ───");
  try {
    await cmd("docker", ["compose", "up", "-d"]);
    println("  ✔ Containers started");
  } catch (e) {
    println("  ✖ Failed to start containers");
    process.exit(1);
  }

  println("");
  println("  ─── Next steps ───");
  println("  • npm run ui       — open the web UI (http://localhost:3456)");
  println("  • npm run status:mcp — check container health");
  println("  • npm run logs:mcp  — view logs");
  println("  • npm run stop:mcp  — stop all containers");
  println("  • npx mcp-docker-setup ui  — or use the CLI");
  println("");
}

async function cmdInitSymlinks() {
  const r = await ask("  Create client symlinks? (Y/n) ");
  if (r.toLowerCase() === "n") return;

  const home = process.env.HOME || process.env.USERPROFILE;
  const generated = path.join(ROOT, "generated");
  if (!fs.existsSync(generated)) { println("  Run 'npm run generate' first."); return; }

  const clients = [
    { name: "VS Code (macOS)", src: "vscode.json", dst: path.join(home, "Library/Application Support/Code/User/mcp.json") },
    { name: "Claude Desktop (macOS)", src: "claude.json", dst: path.join(home, "Library/Application Support/Claude/claude_desktop_config.json") },
    { name: "OpenCode", src: "opencode.json", dst: path.join(home, ".config/opencode/opencode.json") },
    { name: "Trae (macOS)", src: "trae.json", dst: path.join(home, "Library/Application Support/Trae/User/mcp.json") },
    { name: "Kiro (user)", src: "kiro.json", dst: path.join(home, ".kiro/settings/mcp.json") },
  ];

  for (const c of clients) {
    const srcFile = path.join(generated, c.src);
    if (!fs.existsSync(srcFile)) continue;
    const dstDir = path.dirname(c.dst);
    if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
    const rel = path.relative(dstDir, srcFile);
    try {
      fs.unlinkSync(c.dst);
    } catch {}
    try {
      fs.symlinkSync(srcFile, c.dst);
      println(`  ✔ ${c.name}`);
    } catch (e) {
      const a = await ask(`  Symlink failed for ${c.name}. Copy instead? (Y/n) `);
      if (a.toLowerCase() !== "n") {
        fs.copyFileSync(srcFile, c.dst);
        println(`  ✔ ${c.name} (copied)`);
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmdName = args[0] || "help";

  const commands = {
    init:     { fn: cmdInit, desc: "Interactive setup wizard" },
    start:    { fn: () => cmd("bash", ["./mcp-start.sh"]), desc: "Start Docker Compose services" },
    stop:     { fn: () => cmd("bash", ["./mcp-stop.sh"]), desc: "Stop Docker Compose services" },
    status:   { fn: () => cmd("bash", ["./mcp-status.sh"]), desc: "Show service status" },
    generate: { fn: () => { execSync("node ./generate.js", { cwd: ROOT, stdio: "inherit" }); }, desc: "Generate client configs" },
    ui:       { fn: () => cmd("node", ["./ui/server.js"]), desc: "Launch web UI (http://localhost:3456)" },
    logs:     { fn: () => cmd("docker", ["compose", "logs", "-f"]), desc: "Tail Docker logs" },
    help:     { fn: showHelp, desc: "Show this help" },
  };

  if (commands[cmdName]) {
    try { await commands[cmdName].fn(); }
    catch (e) { process.exitCode = 1; if (e.message) console.error(e.message); }
  } else {
    console.error(`Unknown command: ${cmdName}\n`);
    showHelp();
    process.exitCode = 1;
  }
}

function showHelp() {
  println("");
  println("  MCP Docker Setup — CLI");
  println("  " + "-".repeat(40));
  println("");
  println("  Usage: npx mcp-docker-setup <command>");
  println("");
  const commands = {
    init:     "Interactive setup wizard (first-time setup)",
    start:    "Start Docker Compose services",
    stop:     "Stop Docker Compose services",
    status:   "Show container status",
    generate: "Generate client configuration files",
    ui:       "Launch web UI at http://localhost:3456",
    logs:     "Tail Docker Compose logs",
    help:     "Show this help message",
  };
  for (const [c, d] of Object.entries(commands)) {
    println(`    ${c.padEnd(12)} ${d}`);
  }
  println("");
  println("  Examples:");
  println("    npx mcp-docker-setup init");
  println("    npx mcp-docker-setup start");
  println("    npx mcp-docker-setup ui");
  println("");
}

main();
