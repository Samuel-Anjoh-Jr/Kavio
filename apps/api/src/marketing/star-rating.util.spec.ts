import { toStarBreakdown } from './star-rating.util';

describe('toStarBreakdown', () => {
  it('renders the specified case: 4.3 is 4 full and 1 half', () => {
    expect(toStarBreakdown(4.3)).toEqual({ full: 4, half: 1, empty: 0, rounded: 4.5 });
  });

  it('rounds down below the quarter, so 4.2 shows no half star', () => {
    expect(toStarBreakdown(4.2)).toEqual({ full: 4, half: 0, empty: 1, rounded: 4 });
  });

  it('rounds up to a whole star past three quarters', () => {
    expect(toStarBreakdown(4.8)).toEqual({ full: 5, half: 0, empty: 0, rounded: 5 });
  });

  it('keeps an exact half exactly half', () => {
    expect(toStarBreakdown(3.5)).toEqual({ full: 3, half: 1, empty: 1, rounded: 3.5 });
  });

  it('always totals five stars', () => {
    for (const rating of [0, 0.2, 1.4, 2.5, 3.7, 4.9, 5]) {
      const { full, half, empty } = toStarBreakdown(rating);
      expect(full + half + empty).toBe(5);
    }
  });

  it('never emits more than one half star', () => {
    for (const rating of [0.5, 1.5, 2.5, 3.5, 4.5]) {
      expect(toStarBreakdown(rating).half).toBe(1);
    }
  });

  it('clamps out-of-range data rather than producing a broken row', () => {
    // A negative `empty` would make the renderer emit a malformed star row.
    expect(toStarBreakdown(7)).toEqual({ full: 5, half: 0, empty: 0, rounded: 5 });
    expect(toStarBreakdown(-1)).toEqual({ full: 0, half: 0, empty: 5, rounded: 0 });
    expect(toStarBreakdown(Number.NaN)).toEqual({ full: 0, half: 0, empty: 5, rounded: 0 });
  });
});
