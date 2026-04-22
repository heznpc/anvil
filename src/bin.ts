#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runServer } from "./server.js";
import { runInit } from "./init.js";

const [, , cmd, ...args] = process.argv;

async function main() {
  switch (cmd) {
    case "mcp":
      await runServer();
      break;
    case "init":
      await runInit(args);
      break;
    case "--version":
    case "-v":
    case "version":
      await printVersion();
      process.exit(0);
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printUsage();
      process.exit(cmd ? 0 : 1);
      break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      printUsage();
      process.exit(1);
  }
}

async function printVersion() {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, "..", "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  console.log(pkg.version);
}

function printUsage() {
  console.log("anvil — atomic workflow recipes for Claude Code\n");
  console.log("Usage:");
  console.log("  anvil mcp         Run the MCP server (referenced by .claude/settings.json)");
  console.log("  anvil init        Register anvil's MCP server in the current repo's .claude/settings.json");
  console.log("  anvil --version   Print the installed anvil version");
  console.log("  anvil help        Show this help");
  console.log("");
  console.log("After `anvil init`, ask Claude: > ship this as \"your commit message\"");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
