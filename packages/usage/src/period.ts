// ─── Period helpers ───────────────────────────────────────────────────────────
// All quota windows are calendar months in UTC.
// Mirrors how Anthropic, Cursor, and OpenAI reset quotas.

export interface UsagePeriod {
  key: string; // "2026-03" — used in Redis keys
  start: Date; // first millisecond of month, UTC
  end: Date; // first millisecond of NEXT month, UTC (exclusive upper bound)
  resetsAt: string; // ISO string of end — sent to clients as X-RateLimit-Reset
}

export function getCurrentPeriod(): UsagePeriod {
  return getPeriodForDate(new Date());
}

export function getPeriodForDate(date: Date): UsagePeriod {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-indexed

  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  const key = `${y}-${String(m + 1).padStart(2, "0")}`;

  return { key, start, end, resetsAt: end.toISOString() };
}

/** Seconds until the current period ends — used as Redis TTL for quota keys. */
export function secondsUntilPeriodEnd(): number {
  const { end } = getCurrentPeriod();
  return Math.ceil((end.getTime() - Date.now()) / 1000);
}
