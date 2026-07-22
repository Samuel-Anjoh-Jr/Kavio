import { densify, isAllowedWindow, kpi, toSlices, windowRange } from './admin-metrics.model';

/**
 * The admin dashboard's arithmetic (ADM-01, ADM-07).
 *
 * These tests exist because every rule here is one that looks harmless when
 * broken: a chart that skips its empty days still draws, a delta against zero
 * still renders, a share of nothing still produces a number. The failure mode is
 * a plausible-looking dashboard, not an error.
 */

describe('isAllowedWindow', () => {
  it('accepts only the four windows operators reason in', () => {
    expect(isAllowedWindow(7)).toBe(true);
    expect(isAllowedWindow(30)).toBe(true);
    expect(isAllowedWindow(90)).toBe(true);
    expect(isAllowedWindow(365)).toBe(true);
  });

  it('refuses an arbitrary range, which would be a denial of service dressed as a filter', () => {
    expect(isAllowedWindow(1)).toBe(false);
    expect(isAllowedWindow(31)).toBe(false);
    expect(isAllowedWindow(100_000)).toBe(false);
    expect(isAllowedWindow(-30)).toBe(false);
  });
});

describe('windowRange', () => {
  it('puts the previous window immediately before the current one, same length', () => {
    const now = new Date('2026-07-22T00:00:00.000Z');
    const range = windowRange(30, now);

    expect(range.end).toEqual(now);
    expect(range.start).toEqual(new Date('2026-06-22T00:00:00.000Z'));
    expect(range.previousStart).toEqual(new Date('2026-05-23T00:00:00.000Z'));

    // The two windows must be equal in length or every delta is comparing
    // unlike periods.
    expect(range.end.getTime() - range.start.getTime()).toBe(
      range.start.getTime() - range.previousStart.getTime(),
    );
  });
});

describe('kpi', () => {
  it('computes a delta as a fraction of the previous window', () => {
    expect(kpi('TOTAL_USERS', 110, 100).delta).toBe(0.1);
    expect(kpi('TOTAL_USERS', 90, 100).delta).toBe(-0.1);
    expect(kpi('TOTAL_USERS', 100, 100).delta).toBe(0);
  });

  it('returns a NULL delta when the previous window was zero', () => {
    // Growth from nothing is undefined. Reporting +100% on a platform's first
    // week produces a figure that gets quoted and means nothing.
    expect(kpi('REVENUE', 50_000, 0).delta).toBeNull();
  });

  it('returns a NULL delta when there is no previous window at all', () => {
    expect(kpi('REVENUE', 50_000, null).delta).toBeNull();
  });

  it('keeps the raw value and previous alongside the delta', () => {
    const result = kpi('JOBS_COMPLETED', 12, 8);
    expect(result).toMatchObject({ key: 'JOBS_COMPLETED', value: 12, previous: 8 });
  });
});

describe('densify', () => {
  const range = windowRange(3, new Date('2026-07-04T00:00:00.000Z'));

  it('emits every day in the range, including days with no rows', () => {
    const points = densify(new Map([['2026-07-02', 5]]), range);

    expect(points).toHaveLength(3);
    expect(points.map((point) => point.bucket)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    // The zeros are the entire point: without them a line chart draws straight
    // through the gap and reads as continuous activity.
    expect(points.map((point) => point.value)).toEqual([0, 5, 0]);
  });

  it('returns all-zero points when nothing happened at all', () => {
    expect(densify(new Map(), range).every((point) => point.value === 0)).toBe(true);
  });
});

describe('toSlices', () => {
  it('ranks slices by value and gives each its share of the total', () => {
    const slices = toSlices([
      { id: 'a', label: 'Plumbing', value: 30 },
      { id: 'b', label: 'Electrical', value: 70 },
    ]);

    expect(slices.map((slice) => slice.label)).toEqual(['Electrical', 'Plumbing']);
    expect(slices[0]?.share).toBe(0.7);
    expect(slices[1]?.share).toBe(0.3);
  });

  it('drops empty slices by default — an empty category is noise on a bar chart', () => {
    const slices = toSlices([
      { id: 'a', label: 'Plumbing', value: 4 },
      { id: 'b', label: 'Roofing', value: 0 },
    ]);

    expect(slices).toHaveLength(1);
    expect(slices[0]?.label).toBe('Plumbing');
  });

  it('keeps empty slices when asked, so a histogram keeps its shape', () => {
    const slices = toSlices(
      [
        { id: null, label: '0-9', value: 0 },
        { id: null, label: '10-19', value: 3 },
      ],
      { keepZero: true },
    );

    expect(slices).toHaveLength(2);
    expect(slices.find((slice) => slice.label === '0-9')?.value).toBe(0);
  });

  it('reports a share of zero rather than NaN when the total is zero', () => {
    // The caller renders share as a bar width; NaN would collapse the bar
    // silently instead of loudly.
    const slices = toSlices([{ id: null, label: '0-9', value: 0 }], { keepZero: true });

    expect(slices[0]?.share).toBe(0);
    expect(Number.isNaN(slices[0]?.share)).toBe(false);
  });

  it('handles an empty input without dividing by zero', () => {
    expect(toSlices([])).toEqual([]);
  });
});
