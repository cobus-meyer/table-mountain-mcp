/**
 * Tool descriptions are the agent's documentation, so they live here and are versioned.
 * `baseline` is the one-line version most servers ship; `v1` is written for agents.
 * The eval suite runs both: `npm run eval -- --descriptions baseline`.
 */
export interface Descriptions {
  today: string;
  bestDay: string;
  from: string;
  to: string;
  dates: string;
}

export const baseline: Descriptions = {
  today: "Get the Table Mountain weather verdict.",
  bestDay: "Get the best day to visit Table Mountain.",
  from: "Start date.",
  to: "End date.",
  dates: "Dates to check.",
};

export const v1: Descriptions = {
  today: [
    "Should someone go up Table Mountain (Cape Town) TODAY? Returns tablemountainweather.com's go/no-go verdict with reasons, warnings, current summit conditions (wind, gusts, cloud, rain, temperature), cable car status and hours, and a better day this week if there is one.",
    "Use for questions about today or right now: going up, hiking, the cable car, wind or cloud on top.",
    "For a specific day other than today, or 'which day is best', use find_best_day instead.",
    "Only covers Table Mountain. Don't use it for other places.",
    "Times are Cape Town local time (UTC+2). Check freshness.stale: if true, follow freshness.note and don't present the data as current.",
  ].join("\n"),
  bestDay: [
    "Rank the days in tablemountainweather.com's 7-day Table Mountain forecast, best first.",
    "Each day has a quality rating (best to worst: good, grey, poor, blocked) and goodHours, the number of hours that day rated good for going up.",
    "Use for 'which day is best', 'is Saturday any good', or planning a trip this week. Pass `dates` for specific days, or `from`/`to` for a range; with no arguments it ranks every remaining day.",
    "Convert weekday names to YYYY-MM-DD using freshness.todayInCapeTown from any earlier result, or call with no arguments and read the weekday field.",
    "Dates outside the forecast come back in notInForecast: say there's no forecast for them yet instead of guessing. If cablewayNote is set, mention it.",
  ].join("\n"),
  from: "First date to include, YYYY-MM-DD (Cape Town). Defaults to today.",
  to: "Last date to include, YYYY-MM-DD (Cape Town).",
  dates: "Specific dates to rate, YYYY-MM-DD (Cape Town). Overrides from/to.",
};

export const DESCRIPTIONS = { baseline, v1 } as const;
export type DescriptionSet = keyof typeof DESCRIPTIONS;
