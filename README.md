# table-mountain-mcp

An MCP server that lets an agent answer "should I go up Table Mountain today?" and "which day this week is best?" using [tablemountainweather.com](https://tablemountainweather.com), which I built.

It ships with an eval suite, because a tool description is the agent's only documentation and the only way to know whether it works is to watch agents use it.

## Tools

| Tool | Use it for | Returns |
|---|---|---|
| `get_table_mountain_today` | Today or right now: going up, hiking, the cable car, wind on top | Go/no-go verdict, reasons, warnings, summit conditions, cable car status and hours, a better day if there is one |
| `find_best_day` | "Which day is best?", "Is Saturday any good?" | The 7-day forecast ranked best first, dates outside the forecast, and a cable car note if it's closed |

Both are read-only and call one public endpoint, `GET https://tablemountainweather.com/api/verdict`, cached for five minutes (the site refreshes every ten).

## Design decisions

- **Freshness is part of the answer.** Every result has a `freshness` block: when the data was observed, its age, the Cape Town date it was made for, and `stale: true` with a plain-language note if it's old or from another day. While building this, the live endpoint served a verdict observed the previous day. An agent reading "verdict: no" without that context would give the wrong advice with full confidence.
- **"Today" means today in Cape Town**, not on the agent's server. Cape Town is UTC+2, so at 23:30 UTC it is already tomorrow there. There's a test for that.
- **Say what's missing instead of dropping it.** Dates past the 7-day forecast come back in `notInForecast`, so the agent says "no forecast yet" rather than silently answering about other days.
- **Errors tell the agent what to do.** When the site is down the tool returns an error that says not to estimate the weather and where the user can check.
- **Weather and the cable car are separate questions.** A good-weather day while the cableway is closed for maintenance gets a `cablewayNote`.
- **Defensive parsing.** The response is validated with Zod and unknown fields pass through, so a site change produces a clear error rather than wrong numbers.

## Install

Requires Node 20+.

```bash
git clone https://github.com/cobus-meyer/table-mountain-mcp && cd table-mountain-mcp
npm install && npm run build
```

Claude Code:

```bash
claude mcp add table-mountain -- node /absolute/path/to/table-mountain-mcp/dist/index.js
```

Claude Desktop, Cursor or any stdio MCP client:

```json
{
  "mcpServers": {
    "table-mountain": { "command": "node", "args": ["/absolute/path/to/table-mountain-mcp/dist/index.js"] }
  }
}
```

## Tests

```bash
npm test
```

Tests drive the server through a real MCP client over an in-memory transport: ranking, stale data, the Cape Town midnight edge, out-of-range dates, a closed cableway, a site outage, bad input, caching and a changed response shape.

## Evals

`evals/cases.ts` holds 12 questions a real user would ask, each run against a frozen API response and a frozen clock:

| Case | What it checks |
|---|---|
| today-no, today-yes | Gives the verdict and a better day |
| wind, last-car | Reads conditions and cable car hours correctly |
| best-this-week, saturday, weekend | Converts weekday names to dates, ranks, reports a poor day honestly |
| out-of-range | Says a date is beyond the forecast instead of guessing |
| stale | Notices the verdict is from yesterday |
| cableway-closed | Good weather, but mentions the closure |
| site-down | Admits it couldn't check, invents no numbers |
| wrong-place | Doesn't use Table Mountain data for Johannesburg |

Each case starts a fresh agent with the server attached and grades the transcript: were the right tools called, does the answer contain the facts that matter, and does it avoid the mistakes that matter. Grading is rule-based on purpose so it's cheap, repeatable and easy to dispute.

```bash
npm run eval:check                                   # offline: cases, fixtures and tools are valid
ANTHROPIC_API_KEY=... npm run eval                   # run all cases once
npm run eval -- --runs 3 --model claude-haiku-5-5    # repeat to see variance
npm run eval -- --descriptions baseline              # compare one-line tool descriptions
```

`--descriptions baseline` swaps in the one-line tool descriptions most servers ship, so the effect of writing descriptions for agents can be measured instead of assumed. Results are written to `evals/results/`.

### Results

12 cases, 3 runs each, on `claude-haiku-5-5`, run on 2026-11-03.

| Description set | Pass rate | Avg tool calls |
|---|---|---|
| `v1` | 100% (36/36) | 1.0 |
| `baseline` | 92% (33/36) | 0.9 |

The only failure was `last-car` on `baseline`, in all 3 runs: the agent said it had no access to the cable car schedule and never called a tool, because the one-line description only mentions a weather verdict. `v1` names cable car status and hours in its description and passed all 3 runs. With no `v1` failures, nothing changed after these runs.

## Fixtures

`fixtures/windy-monday.json` is a real response from the live API. `calm-monday.json` and `cableway-closed.json` are edited copies of it for cases the live API wasn't showing at the time.

## License

MIT
