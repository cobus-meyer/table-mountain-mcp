import { describe, expect, it } from "vitest";
import { CASES } from "../evals/cases.js";
import { grade, runCase } from "../evals/harness.js";

/** A scripted stand-in for the Anthropic client: calls the given tools, then answers. */
function fakeModel(script: { tools: { name: string; input: object }[]; answer: string }) {
  let turn = 0;
  const seen: any[] = [];
  return {
    seen,
    messages: {
      async create(req: any) {
        seen.push(req);
        const usage = { input_tokens: 10, output_tokens: 5 };
        if (turn++ === 0 && script.tools.length) {
          return {
            usage,
            content: script.tools.map((t, i) => ({ type: "tool_use", id: `t${i}`, name: t.name, input: t.input })),
          };
        }
        return { usage, content: [{ type: "text", text: script.answer }] };
      },
    },
  };
}

const byId = (id: string) => CASES.find((c) => c.id === id)!;

describe("eval harness", () => {
  it("passes a correct agent and feeds it real tool output", async () => {
    const model = fakeModel({
      tools: [{ name: "get_table_mountain_today", input: {} }],
      answer: "No, it's too gusty today. Go on Wednesday instead.",
    });
    const o = await runCase(model, byId("today-no"), 1, "fake", "v1");
    expect(o.pass).toBe(true);
    const toolResult = model.seen[1].messages
      .flatMap((m: any) => (Array.isArray(m.content) ? m.content : []))
      .find((b: any) => b.type === "tool_result");
    expect(toolResult.content[0].text).toContain('"gustsKmh": 67');
    expect(model.seen[0].tools.map((t: any) => t.name)).toContain("find_best_day");
  });

  it("fails an agent that skips the tool and guesses", async () => {
    const model = fakeModel({ tools: [], answer: "Yes, today looks lovely." });
    const o = await runCase(model, byId("today-no"), 1, "fake", "v1");
    expect(o.pass).toBe(false);
    expect(o.failures).toContain("did not call get_table_mountain_today");
  });

  it("fails an agent that invents conditions when the site is down", async () => {
    const model = fakeModel({
      tools: [{ name: "get_table_mountain_today", input: {} }],
      answer: "Couldn't check, but it's probably around 20 km/h.",
    });
    const o = await runCase(model, byId("site-down"), 1, "fake", "v1");
    expect(o.pass).toBe(false);
    expect(o.failures.some((f) => f.includes("forbidden"))).toBe(true);
  });

  it("grades every case's regexes without throwing", () => {
    for (const c of CASES) expect(() => grade(c, [], "")).not.toThrow();
  });
});
