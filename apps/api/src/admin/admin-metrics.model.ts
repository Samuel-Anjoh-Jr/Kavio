/**
 * The pure arithmetic behind the admin dashboard and reports (ADM-01, ADM-07).
 *
 * Extracted from the service because these are the rules that are easy to get
 * subtly wrong and impossible to notice afterwards: a delta computed against
 * zero, a chart that omits its empty days, a share that divides by nothing. None
 * of them touch the database, so all of them are testable directly — which is
 * the point of them living here.
 */

/** Windows an operator actually reasons in. Anything else is refused. */
export const ALLOWED_WINDOW_DAYS = [7, 30, 90, 365] as const;

export function isAllowedWindow(days: number): boolean {
  return (ALLOWED_WINDOW_DAYS as readonly number[]).includes(days);
}

export interface WindowRange {
  start: Date;
  end: Date;
  /** The equal-length window immediately before `start`, for deltas. */
  previousStart: Date;
  days: number;
}

export function windowRange(days: number, now: Date = new Date()): WindowRange {
  const end = now;
  const start = new Date(end.getTime() - days * 86_400_000);
  const previousStart = new Date(start.getTime() - days * 86_400_000);
  return { start, end, previousStart, days };
}

export interface KpiValue {
  key: string;
  value: number;
  previous: number | null;
  delta: number | null;
}

/**
 * A KPI with its movement against the preceding window.
 *
 * The delta is NULL when the previous window is absent OR zero. Growth from
 * nothing is undefined, not infinite and not +100% — and on a platform's first
 * month the alternative prints spectacular figures that people then quote in
 * board decks.
 */
export function kpi(key: string, value: number, previous: number | null): KpiValue {
  return {
    key,
    value,
    previous,
    delta:
      previous === null || previous === 0
        ? null
        : Number(((value - previous) / previous).toFixed(4)),
  };
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface TimePoint {
  bucket: string;
  value: number;
}

/**
 * Fills every day in the range.
 *
 * Postgres `GROUP BY date` returns only the days that HAVE rows. Handing that
 * straight to a line chart draws a continuous line across the gaps, which reads
 * as steady activity on days when nothing happened. Densifying makes an empty
 * day the zero it actually is.
 */
export function densify(values: Map<string, number>, range: WindowRange): TimePoint[] {
  const points: TimePoint[] = [];
  const cursor = new Date(
    Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), range.start.getUTCDate()),
  );

  while (cursor < range.end) {
    const key = dayKey(cursor);
    points.push({ bucket: key, value: values.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return points;
}

export interface BreakdownSlice {
  id: string | null;
  label: string;
  value: number;
  share: number;
}

/**
 * Turns rows into ranked slices carrying their share of the total.
 *
 * Zero-valued rows are dropped by default (an empty category is noise on a bar
 * chart) but KEPT when `keepZero` is set — which is what a histogram needs,
 * because a distribution that silently omits its empty bands changes its own
 * shape, and the shape is the entire reason to look at one.
 */
export function toSlices(
  rows: { id: string | null; label: string; value: number }[],
  options: { keepZero?: boolean } = {},
): BreakdownSlice[] {
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return rows
    .filter((row) => options.keepZero || row.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((row) => ({
      ...row,
      // Share of nothing is zero, not NaN — the caller renders this as a bar
      // width, and NaN would collapse the bar silently rather than loudly.
      share: total === 0 ? 0 : Number((row.value / total).toFixed(4)),
    }));
}
