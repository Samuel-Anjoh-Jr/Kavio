import { describe, expect, it } from 'vitest';
import { formatRating, formatXaf, initials } from './discovery';

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
