import { describe, expect, it } from 'vitest';
import { formatRating, formatResponseTime, formatXaf, initials } from './discovery';

const t = (key: string, values?: { value: string }) => (values ? `${key}:${values.value}` : key);

describe('formatXaf', () => {
  it('never shows decimals — XAF has no minor unit', () => {
    const formatted = formatXaf(5000, 'en');
    expect(formatted).toBeTruthy();
    expect(formatted).not.toContain('.00');
    expect(formatted).toMatch(/5[\s  ,]?000/);
  });

  it('rounds rather than truncating a fractional amount', () => {
    expect(formatXaf(4999.6, 'en')).toMatch(/5[\s  ,]?000/);
  });

  it('returns null when there is no price, so the UI can say "ask"', () => {
    expect(formatXaf(null, 'en')).toBeNull();
    expect(formatXaf(undefined, 'fr')).toBeNull();
    expect(formatXaf(Number.NaN, 'en')).toBeNull();
  });
});

describe('formatRating', () => {
  it('renders one decimal in the viewer’s locale', () => {
    expect(formatRating(4.75, 'en')).toBe('4.8');
    expect(formatRating(4.75, 'fr')).toBe('4,8');
  });

  it('distinguishes unrated from badly rated', () => {
    expect(formatRating(null, 'en')).toBeNull();
    expect(formatRating(0, 'en')).toBe('0.0');
  });
});

describe('formatResponseTime', () => {
  it('returns null when there is no data, so the UI can omit the stat entirely', () => {
    expect(formatResponseTime(null, t)).toBeNull();
    expect(formatResponseTime(undefined, t)).toBeNull();
  });

  it('buckets an hour or less as withinHour, with no value interpolated', () => {
    expect(formatResponseTime(45, t)).toBe('withinHour');
    expect(formatResponseTime(60, t)).toBe('withinHour');
  });

  it('rounds UP to whole hours so the claim never understates the real median', () => {
    expect(formatResponseTime(61, t)).toBe('withinHours:2');
    expect(formatResponseTime(180, t)).toBe('withinHours:3');
  });

  it('switches to days at the 24-hour mark, singular for exactly one day', () => {
    expect(formatResponseTime(24 * 60, t)).toBe('withinDay');
    expect(formatResponseTime(24 * 60 + 1, t)).toBe('withinDays:2');
  });

  it('caps the claim at a week rather than a precise "9 days"', () => {
    expect(formatResponseTime(8 * 24 * 60, t)).toBe('aboutAWeek');
  });
});

describe('initials', () => {
  it('takes the first and last name, never the middle ones', () => {
    expect(initials('Jean Claude Mbarga')).toBe('JM');
    expect(initials('Awa')).toBe('A');
  });

  it('falls back rather than rendering an empty avatar', () => {
    expect(initials(null)).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});
