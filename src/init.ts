import { promises as fs } from "fs";
import * as path from "path";

export async function runInit(_args: string[]) {
  const cwd = process.cwd();
  const settingsDir = path.join(cwd, ".claude");
  const settingsPath = path.join(settingsDir, "settings.json");

  await fs.mkdir(settingsDir, { recursive: true });

  let settings: { mcpServers?: Record<string, unknown>; [k: string]: unknown } = {};
  try {
    const raw = await fs.readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // file doesn't exist yet; start from empty
  }

  settings.mcpServers = (settings.mcpServers ?? {}) as Record<string, unknown>;
  (settings.mcpServers as Record<string, unknown>).anvil = {
    command: "anvil",
    args: ["mcp"],
  };

  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");

  console.log(`✓ Registered anvil MCP server in ${settingsPath}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Restart Claude Code in this repo so it picks up the new MCP server.");
  console.log("  2. Ask Claude: > ship this as \"your commit message\"");
  console.log("  3. Optional: add to your CLAUDE.md so Claude knows to prefer the tool:");
  console.log("       \"To ship changes, call the anvil `ship` MCP tool. Do not invoke git/gh directly for shipping.\"");
}
