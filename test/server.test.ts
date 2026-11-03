import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { ApiError, HttpVerdictSource, StaticVerdictSource, VerdictSchema } from "../src/api.js";
import { createServer } from "../src/server.js";

const fixture = (name: string) =>
  VerdictSchema.parse(JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")));

const MONDAY_10AM = new Date("2026-11-02T10:00:00+02:00");
const TUESDAY_11AM = new Date("2026-11-03T11:00:00+02:00");

async function connect(source: StaticVerdictSource | HttpVerdictSource, now = MONDAY_10AM) {
  const server = createServer({ source, clock: () => now });
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as {
    structuredContent?: any;
    isError?: boolean;
    content: { type: string; text: string }[];
  };
  return res;
}

describe("tool listing", () => {
  it("exposes two read-only tools with input schemas", async () => {
    const client = await connect(new StaticVerdictSource(fixture("windy-monday")));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["find_best_day", "get_table_mountain_today"]);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.description!.length).toBeGreaterThan(100);
    }
  });
});

describe("get_table_mountain_today", () => {
  it("returns the verdict, conditions and better day", async () => {
    const client = await connect(new StaticVerdictSource(fixture("windy-monday")));
    const { structuredContent: r } = await call(client, "get_table_mountain_today");
    expect(r.verdict).toBe("no");
    expect(r.betterDay).toMatchObject({ date: "2026-11-04", weekday: "Wednesday" });
    expect(r.conditions.gustsKmh).toBe(67);
    expect(r.cableway.lastCarDown).toBe("20:00");
    expect(r.freshness).toMatchObject({ stale: false, ageMinutes: 60, todayInCapeTown: "2026-11-02" });
  });

  it("flags a verdict from yesterday as stale and says which day it is for", async () => {
    const client = await connect(new StaticVerdictSource(fixture("windy-monday")), TUESDAY_11AM);
    const { structuredContent: r } = await call(client, "get_table_mountain_today");
    expect(r.freshness.stale).toBe(true);
    expect(r.freshness.verdictFor).toBe("2026-11-02");
    expect(r.freshness.note).toMatch(/Monday 2026-11-02, not today \(Tuesday 2026-11-03\)/);
  });

  it("uses Cape Town's date, not UTC's, around midnight", async () => {
    // 23:30 UTC on the 2nd is 01:30 on the 3rd in Cape Town.
    const client = await connect(new StaticVerdictSource(fixture("windy-monday")), new Date("2026-11-02T23:30:00Z"));
    const { structuredContent: r } = await call(client, "get_table_mountain_today");
    expect(r.freshness.todayInCapeTown).toBe("2026-11-03");
    expect(r.freshness.stale).toBe(true);
  });

  it("returns an error that tells the agent not to guess when the site is down", async () => {
    const client = await connect(new StaticVerdictSource(new ApiError("tablemountainweather.com returned HTTP 503.")));
    const res = await call(client, "get_table_mountain_today");
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/HTTP 503.*don't estimate/s);
  });
});

describe("find_best_day", () => {
  it("ranks remaining days best first and skips past days", async () => {
    const client = await connect(new StaticVerdictSource(fixture("windy-monday")), TUESDAY_11AM);
    const { structuredContent: r } = await call(client, "find_best_day");
    expect(r.days.map((d: any) => d.date)).toEqual([
      "2026-11-03", "2026-11-04", "2026-11-08", "2026-11-06", "2026-11-07", "2026-11-05",
    ]);
    expect(r.bestDay.weekday).toBe("Tuesday");
  });

  it("picks Sunday over Saturday for a weekend", async () => {
    const client = await connect(new StaticVerdictSource(fixture("windy-monday")));
    const { structuredContent: r } = await call(client, "find_best_day", { from: "2026-11-07", to: "2026-11-08" });
    expect(r.bestDay).toMatchObject({ weekday: "Sunday", quality: "grey", goodHours: 7 });
  });

  it("reports dates outside the forecast instead of dropping them silently", async () => {
    const client = await connect(new StaticVerdictSource(fixture("windy-monday")));
    const { structuredContent: r } = await call(client, "find_best_day", { dates: ["2026-11-07", "2026-11-13"] });
    expect(r.days).toHaveLength(1);
    expect(r.notInForecast).toEqual(["2026-11-13"]);
    expect(r.forecastCovers).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });

  it("adds a cableway note when the cable car is closed", async () => {
    const client = await connect(new StaticVerdictSource(fixture("cableway-closed")));
    const { structuredContent: r } = await call(client, "find_best_day");
    expect(r.cablewayNote).toMatch(/closed until 2026-11-05: Annual maintenance/);
  });

  it("rejects badly formatted dates with a clear message", async () => {
    const client = await connect(new StaticVerdictSource(fixture("windy-monday")));
    const res = await call(client, "find_best_day", { dates: ["next friday"] });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/YYYY-MM-DD/);
  });
});

describe("HttpVerdictSource", () => {
  const body = readFileSync(new URL("../fixtures/windy-monday.json", import.meta.url), "utf8");

  it("caches responses for the TTL and identifies itself", async () => {
    let calls = 0;
    let ua = "";
    let t = 0;
    const fake = (async (_url: string, init: RequestInit) => {
      calls++;
      ua = (init.headers as Record<string, string>)["user-agent"];
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const src = new HttpVerdictSource("https://x/api", 60_000, fake, () => t);
    await src.get();
    t = 30_000;
    await src.get();
    expect(calls).toBe(1);
    t = 61_000;
    await src.get();
    expect(calls).toBe(2);
    expect(ua).toMatch(/^table-mountain-mcp\//);
  });

  it("turns a changed response shape into a clear error", async () => {
    const fake = (async () => new Response(JSON.stringify({ hello: "world" }))) as unknown as typeof fetch;
    await expect(new HttpVerdictSource("https://x/api", 0, fake).get()).rejects.toThrow(/unexpected shape/);
  });
});
