import { CAPE_TOWN_TZ, type Day, type Verdict } from "./api.js";

/** Data older than this is flagged as stale. The site normally refreshes every ten minutes. */
export const STALE_AFTER_MINUTES = 90;

/** The site's day ratings, best first. */
export const QUALITY_ORDER = ["excellent", "good", "grey", "poor", "blocked"] as const;

export function capeTownDate(at: Date): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: CAPE_TOWN_TZ }).format(at);
}

export function weekday(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export interface Freshness {
  observedAt: string;
  ageMinutes: number;
  /** Cape Town date the verdict was made for. */
  verdictFor: string;
  /** Cape Town date right now. */
  todayInCapeTown: string;
  stale: boolean;
  note?: string;
}

export function freshness(v: Verdict, now: Date): Freshness {
  const observed = new Date(v.observedAt);
  const ageMinutes = Math.max(0, Math.round((now.getTime() - observed.getTime()) / 60_000));
  const verdictFor = capeTownDate(observed);
  const todayInCapeTown = capeTownDate(now);
  const wrongDay = verdictFor !== todayInCapeTown;
  const stale = wrongDay || ageMinutes > STALE_AFTER_MINUTES;
  let note: string | undefined;
  if (wrongDay) {
    note = `This verdict was made for ${weekday(verdictFor)} ${verdictFor}, not today (${weekday(todayInCapeTown)} ${todayInCapeTown}). Say so; don't present it as today's verdict. Use find_best_day for today's rating.`;
  } else if (stale) {
    note = `The data is ${ageMinutes} minutes old, so conditions may have changed. Mention this.`;
  }
  return { observedAt: v.observedAt, ageMinutes, verdictFor, todayInCapeTown, stale, ...(note ? { note } : {}) };
}

function rank(quality: string): number {
  const i = (QUALITY_ORDER as readonly string[]).indexOf(quality);
  return i === -1 ? QUALITY_ORDER.length : i;
}

export function todayResult(v: Verdict, now: Date) {
  return {
    verdict: v.verdict,
    headline: v.headline,
    reasons: v.reasons,
    warnings: v.warnings,
    betterDay: v.betterDay
      ? { date: v.betterDay.date, weekday: v.betterDay.weekday ?? weekday(v.betterDay.date), quality: v.betterDay.quality }
      : null,
    conditions: v.conditions ?? null,
    cableway: v.cableway ?? null,
    tablecloth: v.tablecloth ?? null,
    freshness: freshness(v, now),
    source: v.source ?? "https://tablemountainweather.com",
  };
}

export interface BestDayInput {
  from?: string;
  to?: string;
  dates?: string[];
}

export function bestDayResult(v: Verdict, now: Date, input: BestDayInput) {
  const fresh = freshness(v, now);
  const today = fresh.todayInCapeTown;
  const forecast = v.week.filter((d) => d.date >= today);
  const covered = forecast.map((d) => d.date);

  let wanted: Day[];
  let notInForecast: string[] = [];
  if (input.dates?.length) {
    wanted = forecast.filter((d) => input.dates!.includes(d.date));
    notInForecast = input.dates.filter((d) => !covered.includes(d));
  } else {
    const from = input.from ?? today;
    const to = input.to ?? "9999-12-31";
    wanted = forecast.filter((d) => d.date >= from && d.date <= to);
    if (input.to && covered.length && input.to > covered[covered.length - 1]) {
      notInForecast = [`dates after ${covered[covered.length - 1]}`];
    }
  }

  const days = wanted
    .map((d) => ({ date: d.date, weekday: weekday(d.date), quality: d.quality, goodHours: d.goodHours }))
    .sort((a, b) => rank(a.quality) - rank(b.quality) || b.goodHours - a.goodHours || a.date.localeCompare(b.date));

  const cableway = v.cableway ?? null;
  return {
    bestDay: days[0] ?? null,
    days,
    notInForecast,
    forecastCovers: covered.length ? { from: covered[0], to: covered[covered.length - 1] } : null,
    cablewayNote:
      cableway && cableway.running === false
        ? `Cableway closed${cableway.closureReason ? ` for ${cableway.closureReason}` : ""}${cableway.closedUntil ? ` and reopens on ${cableway.closedUntil}` : ""}. Day ratings are about the weather, so check this before recommending a cable car trip.`
        : null,
    freshness: fresh,
  };
}
