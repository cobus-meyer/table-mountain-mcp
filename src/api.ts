import { z } from "zod";

export const API_URL = "https://tablemountainweather.com/api/verdict";
export const USER_AGENT = "table-mountain-mcp/0.1.0 (+https://github.com/cobus-meyer/table-mountain-mcp)";

/** Cape Town has no daylight saving: always UTC+02:00. */
export const CAPE_TOWN_TZ = "Africa/Johannesburg";

/**
 * Shape of GET /api/verdict, as observed on 2026-11-03.
 * Fields we don't depend on are passthrough so a site change doesn't break the server.
 */
export const DaySchema = z.object({
  date: z.string(),
  quality: z.string(),
  goodHours: z.number(),
});

export const VerdictSchema = z.looseObject({
  question: z.string().optional(),
  verdict: z.string(),
  headline: z.string(),
  reasons: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  betterDay: z
    .looseObject({
      date: z.string(),
      weekday: z.string().optional(),
      quality: z.string().optional(),
    })
    .nullable()
    .optional(),
  todayIsBest: z.boolean().optional(),
  week: z.array(DaySchema).default([]),
  cableway: z
    .looseObject({
      running: z.boolean().nullable().optional(),
      closedUntil: z.string().nullable().optional(),
      closureReason: z.string().nullable().optional(),
      firstCarUp: z.string().nullable().optional(),
      lastCarUp: z.string().nullable().optional(),
      lastCarDown: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  conditions: z
    .looseObject({
      temperatureC: z.number().nullable().optional(),
      windKmh: z.number().nullable().optional(),
      gustsKmh: z.number().nullable().optional(),
      cloudCoverPct: z.number().nullable().optional(),
      lowCloudPct: z.number().nullable().optional(),
      precipitationMm: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  tablecloth: z.unknown().optional(),
  observedAt: z.string(),
  source: z.string().optional(),
});

export type Verdict = z.infer<typeof VerdictSchema>;
export type Day = z.infer<typeof DaySchema>;

export interface VerdictSource {
  get(): Promise<Verdict>;
}

export class ApiError extends Error {}

/** Fetches /api/verdict with a short in-memory cache. The site refreshes every ten minutes. */
export class HttpVerdictSource implements VerdictSource {
  private cached?: { at: number; value: Verdict };

  constructor(
    private readonly url = API_URL,
    private readonly ttlMs = 5 * 60_000,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {}

  async get(): Promise<Verdict> {
    const now = this.clock();
    if (this.cached && now - this.cached.at < this.ttlMs) return this.cached.value;

    let res: Response;
    try {
      res = await this.fetchImpl(this.url, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new ApiError(`Could not reach tablemountainweather.com (${(err as Error).message}).`);
    }
    if (!res.ok) throw new ApiError(`tablemountainweather.com returned HTTP ${res.status}.`);

    const parsed = VerdictSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new ApiError("tablemountainweather.com returned data in an unexpected shape.");

    this.cached = { at: now, value: parsed.data };
    return parsed.data;
  }
}

/** Serves a fixed response. Used by tests and evals. */
export class StaticVerdictSource implements VerdictSource {
  constructor(private readonly value: Verdict | Error) {}
  async get(): Promise<Verdict> {
    if (this.value instanceof Error) throw this.value;
    return this.value;
  }
}
