/**
 * Agent eval cases. Each runs a fresh agent with the MCP server attached, against a frozen
 * API response (fixture) and a frozen clock, so results are comparable across runs.
 *
 * Grading is rule-based on purpose: cheap, deterministic and easy to argue with.
 *   tools        every tool listed must be called at least once
 *   noTools      the agent must not call any tool
 *   mustMatch    every regex must match the final answer
 *   mustNotMatch no regex may match the final answer
 */
export interface EvalCase {
  id: string;
  question: string;
  fixture: "windy-monday" | "calm-monday" | "cableway-closed" | "site-down";
  now: string;
  tests: string;
  tools?: string[];
  noTools?: boolean;
  mustMatch?: RegExp[];
  mustNotMatch?: RegExp[];
}

const MON = "2026-11-02T10:00:00+02:00";
const TUE = "2026-11-03T11:00:00+02:00";

export const CASES: EvalCase[] = [
  {
    id: "today-no",
    question: "Should I go up Table Mountain today?",
    fixture: "windy-monday",
    now: MON,
    tests: "Gives the verdict and the better day",
    tools: ["get_table_mountain_today"],
    mustMatch: [/\b(no|not today|skip|wouldn'?t|don'?t)\b/i, /wednesday/i],
    mustNotMatch: [/\byes\b,? (go|today)/i],
  },
  {
    id: "today-yes",
    question: "Thinking of taking the cable car up this morning. Good idea?",
    fixture: "calm-monday",
    now: MON,
    tests: "Gives a yes on a good day",
    tools: ["get_table_mountain_today"],
    mustMatch: [/\b(yes|good (day|idea)|go for it)\b/i],
    mustNotMatch: [/\bwednesday\b/i],
  },
  {
    id: "wind",
    question: "How windy is it on top of Table Mountain right now?",
    fixture: "windy-monday",
    now: MON,
    tests: "Reports wind and gusts with units",
    tools: ["get_table_mountain_today"],
    mustMatch: [/23\s?km\/?h/i, /67\s?km\/?h/i],
  },
  {
    id: "last-car",
    question: "What time is the last cable car down?",
    fixture: "windy-monday",
    now: MON,
    tests: "Reads cableway hours",
    tools: ["get_table_mountain_today"],
    mustMatch: [/20:00|8(:00)?\s?(pm|p\.m\.)/i],
  },
  {
    id: "best-this-week",
    question: "Which day this week is best to go up Table Mountain?",
    fixture: "windy-monday",
    now: MON,
    tests: "Ranks the week and names a top day",
    tools: ["find_best_day"],
    mustMatch: [/tuesday|wednesday/i],
    mustNotMatch: [/\b(saturday|thursday) (is|would be) (the )?best/i],
  },
  {
    id: "saturday",
    question: "Is Saturday any good for going up the mountain?",
    fixture: "windy-monday",
    now: MON,
    tests: "Converts a weekday to a date and reports a poor day honestly",
    tools: ["find_best_day"],
    mustMatch: [/\b(poor|not (great|ideal|good)|2 (good )?hours?|two (good )?hours?)\b/i],
    mustNotMatch: [/saturday (is|looks) (great|good|ideal)/i],
  },
  {
    id: "weekend",
    question: "I can only go this weekend. Saturday or Sunday?",
    fixture: "windy-monday",
    now: MON,
    tests: "Compares two days and picks the better one",
    tools: ["find_best_day"],
    mustMatch: [/sunday/i],
  },
  {
    id: "out-of-range",
    question: "What will it be like on the mountain on Friday 13 November?",
    fixture: "windy-monday",
    now: MON,
    tests: "Says the date is beyond the forecast instead of guessing",
    tools: ["find_best_day"],
    mustMatch: [/(no forecast|not (yet )?(available|covered|in the forecast)|only (goes|covers|runs)|beyond|too far|until (sunday|8 nov|2026-11-08))/i],
    mustNotMatch: [/13 november (is|looks) (good|poor|great)/i],
  },
  {
    id: "stale",
    question: "Should I go up Table Mountain today?",
    fixture: "windy-monday",
    now: TUE,
    tests: "Notices the verdict is from yesterday and doesn't present it as today's",
    tools: ["get_table_mountain_today"],
    mustMatch: [/(yesterday|monday|2 nov|2026-11-02|out of date|outdated|stale|not (today|current|up to date))/i],
    mustNotMatch: [/^\s*no\b[.,]? (go|don'?t)/i],
  },
  {
    id: "cableway-closed",
    question: "Planning to take the cable car up on Wednesday. Is that a good plan?",
    fixture: "cableway-closed",
    now: MON,
    tests: "Good weather, but surfaces the cable car closure",
    tools: ["find_best_day"],
    mustMatch: [/(closed|maintenance|not running)/i],
  },
  {
    id: "site-down",
    question: "Should I go up Table Mountain today?",
    fixture: "site-down",
    now: MON,
    tests: "Admits it couldn't check instead of inventing conditions",
    tools: ["get_table_mountain_today"],
    mustMatch: [/(couldn'?t|could not|unable|can'?t|not able|unavailable|down)/i],
    mustNotMatch: [/\d+\s?km\/?h/i],
  },
  {
    id: "wrong-place",
    question: "What's the weather like in Johannesburg today?",
    fixture: "windy-monday",
    now: MON,
    tests: "Doesn't use Table Mountain data for another city",
    mustNotMatch: [/23\s?km\/?h|67\s?km\/?h|12\s?°/i],
  },
];
