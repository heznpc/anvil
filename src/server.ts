import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ship, type ShipArgs } from "./ship.js";

export async function runServer() {
  const server = new Server(
    { name: "anvil", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "ship",
        description:
          "Atomic ship pipeline: stage all → commit → push → open PR → wait for CI → merge. " +
          "Either runs end-to-end or errors cleanly. " +
          "Use this INSTEAD OF separate git/gh commands when the user asks to ship, deploy, or release. " +
          "Do not ask for per-step confirmation; the tool itself is the atomic unit.",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Commit message and PR title. Required.",
            },
            branch: {
              type: "string",
              description:
                "Branch name. Used only when starting from the base branch. Default: ship/<timestamp>.",
            },
            strategy: {
              type: "string",
              enum: ["squash", "merge", "rebase"],
              description: "Merge strategy. Default: squash.",
            },
            base: {
              type: "string",
              description: "Base branch for the PR. Default: main.",
            },
          },
          required: ["message"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "ship") {
      throw new Error(`Unknown tool: ${req.params.name}`);
    }
    const result = await ship(req.params.arguments as unknown as ShipArgs);
    return { content: [{ type: "text", text: result }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
