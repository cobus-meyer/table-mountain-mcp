import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiError, StaticVerdictSource, VerdictSchema } from "../src/api.js";
import type { DescriptionSet } from "../src/descriptions.js";
import { createServer } from "../src/server.js";
import type { EvalCase } from "./cases.js";

function source(fixture: EvalCase["fixture"]) {
  if (fixture === "site-down") return new StaticVerdictSource(new ApiError("tablemountainweather.com returned HTTP 503."));
  const json = JSON.parse(readFileSync(new URL(`../fixtures/${fixture}.json`, import.meta.url), "utf8"));
  return new StaticVerdictSource(VerdictSchema.parse(json));
}

export async function connect(c: EvalCase, descriptions: DescriptionSet) {
  const server = createServer({ source: source(c.fixture), clock: () => new Date(c.now), descriptions });
  const client = new Client({ name: "eval", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

export function systemPrompt(c: EvalCase) {
  const when = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(c.now));
  return `You are a helpful assistant. The user is in Cape Town. It is ${when} there. Answer briefly. Use tools when they help.`;
}

export interface Outcome {
  id: string;
  run: number;
  pass: boolean;
  failures: string[];
  toolCalls: { name: string; args: unknown }[];
  answer: string;
  inputTokens: number;
  outputTokens: number;
}

export function grade(c: EvalCase, toolCalls: Outcome["toolCalls"], answer: string): string[] {
  const failures: string[] = [];
  const called = new Set(toolCalls.map((t) => t.name));
  for (const t of c.tools ?? []) if (!called.has(t)) failures.push(`did not call ${t}`);
  if (c.noTools && toolCalls.length) failures.push(`called tools: ${[...called].join(", ")}`);
  for (const re of c.mustMatch ?? []) if (!re.test(answer)) failures.push(`answer missing ${re}`);
  for (const re of c.mustNotMatch ?? []) if (re.test(answer)) failures.push(`answer matched forbidden ${re}`);
  return failures;
}

export async function runCase(anthropic: any, c: EvalCase, run: number, model: string, descriptions: DescriptionSet): Promise<Outcome> {
  const client = await connect(c, descriptions);
  const { tools } = await client.listTools();
  const anthropicTools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  const messages: any[] = [{ role: "user", content: c.question }];
  const toolCalls: Outcome["toolCalls"] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let answer = "";

  for (let turn = 0; turn < 6; turn++) {
    const res = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt(c),
      tools: anthropicTools,
      messages,
    });
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;
    messages.push({ role: "assistant", content: res.content });

    const uses = res.content.filter((b: any) => b.type === "tool_use");
    if (!uses.length) {
      answer = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      break;
    }
    const results = [];
    for (const u of uses) {
      toolCalls.push({ name: u.name, args: u.input });
      const r: any = await client.callTool({ name: u.name, arguments: u.input });
      results.push({
        type: "tool_result",
        tool_use_id: u.id,
        is_error: Boolean(r.isError),
        content: r.content.map((x: any) => ({ type: "text", text: x.text })),
      });
    }
    messages.push({ role: "user", content: results });
  }

  const failures = grade(c, toolCalls, answer);
  return { id: c.id, run, pass: failures.length === 0, failures, toolCalls, answer, inputTokens, outputTokens };
}

