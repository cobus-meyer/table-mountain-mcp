import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiError, type VerdictSource } from "./api.js";
import { DESCRIPTIONS, type DescriptionSet } from "./descriptions.js";
import { bestDayResult, todayResult } from "./logic.js";

export interface ServerOptions {
  source: VerdictSource;
  clock?: () => Date;
  descriptions?: DescriptionSet;
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

function ok(data: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function fail(err: unknown) {
  const reason = err instanceof ApiError ? err.message : "Unexpected error fetching Table Mountain conditions.";
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: `${reason} No conditions are available right now. Tell the user you couldn't check, and don't estimate the weather. They can look at https://tablemountainweather.com directly.`,
      },
    ],
  };
}

export function createServer({ source, clock = () => new Date(), descriptions = "v1" }: ServerOptions): McpServer {
  const d = DESCRIPTIONS[descriptions];
  const server = new McpServer({ name: "table-mountain", version: "0.1.0" });

  server.registerTool(
    "get_table_mountain_today",
    {
      title: "Table Mountain today",
      description: d.today,
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
    },
    async () => {
      try {
        return ok(todayResult(await source.get(), clock()));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "find_best_day",
    {
      title: "Best day to go up Table Mountain",
      description: d.bestDay,
      inputSchema: {
        from: DATE.optional().describe(d.from),
        to: DATE.optional().describe(d.to),
        dates: z.array(DATE).max(14).optional().describe(d.dates),
      },
      annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
    },
    async (args) => {
      try {
        return ok(bestDayResult(await source.get(), clock(), args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  return server;
}
