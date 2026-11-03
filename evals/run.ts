/**
 * Runs the agent eval suite.
 *
 *   npm run eval:check                       validate cases and tools offline (no API key)
 *   ANTHROPIC_API_KEY=... npm run eval       run every case once with the default model
 *   npm run eval -- --runs 3 --model claude-haiku-5-5 --descriptions baseline --only stale,saturday
 *
 * Each case gets a fresh agent connected to the real MCP server over an in-memory transport,
 * with the API response and clock frozen. Results go to evals/results/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DESCRIPTIONS, type DescriptionSet } from "../src/descriptions.js";
import { CASES } from "./cases.js";
import { connect, runCase, type Outcome } from "./harness.js";

const { values: opts } = parseArgs({
  options: {
    check: { type: "boolean", default: false },
    model: { type: "string", default: "claude-haiku-5-5" },
    descriptions: { type: "string", default: "v1" },
    runs: { type: "string", default: "1" },
    only: { type: "string" },
  },
});

const descriptions = opts.descriptions as DescriptionSet;
if (!(descriptions in DESCRIPTIONS)) throw new Error(`Unknown description set: ${descriptions}`);
const cases = opts.only ? CASES.filter((c) => opts.only!.split(",").includes(c.id)) : CASES;

async function check() {
  let problems = 0;
  for (const c of cases) {
    const client = await connect(c, descriptions);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const t of c.tools ?? []) {
      if (!names.includes(t)) {
        console.log(`✗ ${c.id}: unknown tool ${t}`);
        problems++;
      }
    }
    for (const name of names) await client.callTool({ name, arguments: {} });
    console.log(`✓ ${c.id}: fixture ${c.fixture} loads, tools respond`);
  }
  if (problems) process.exit(1);
  console.log(`\n${cases.length} cases OK. Run with ANTHROPIC_API_KEY set to evaluate an agent.`);
}

async function main() {
  if (opts.check) return check();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY, or use --check for an offline run.");
    process.exit(1);
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic();
  const runs = Number(opts.runs);
  const outcomes: Outcome[] = [];

  for (const c of cases) {
    for (let run = 1; run <= runs; run++) {
      const o = await runCase(anthropic, c, run, opts.model!, descriptions);
      outcomes.push(o);
      console.log(`${o.pass ? "✓" : "✗"} ${c.id}#${run}${o.pass ? "" : `  ${o.failures.join("; ")}`}`);
    }
  }

  const passed = outcomes.filter((o) => o.pass).length;
  const summary = {
    model: opts.model,
    descriptions,
    runs,
    passRate: passed / outcomes.length,
    passed,
    total: outcomes.length,
    avgToolCalls: outcomes.reduce((s, o) => s + o.toolCalls.length, 0) / outcomes.length,
    inputTokens: outcomes.reduce((s, o) => s + o.inputTokens, 0),
    outputTokens: outcomes.reduce((s, o) => s + o.outputTokens, 0),
  };
  console.log(
    `\n${summary.model} · descriptions=${descriptions} · ${passed}/${outcomes.length} passed (${Math.round(summary.passRate * 100)}%) · ${summary.avgToolCalls.toFixed(1)} tool calls/case`,
  );

  mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
  const file = new URL(`./results/${new Date().toISOString().replace(/[:.]/g, "-")}-${opts.model}-${descriptions}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify({ summary, outcomes }, null, 2));
  console.log(`Saved ${file.pathname}`);
  if (passed < outcomes.length) process.exitCode = 1;
}

await main();
