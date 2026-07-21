import {
  DEFAULT_RANKING_WEIGHTS,
  NO_LOCATION_RANKING_WEIGHTS,
  normaliseSort,
  weightsFor,
} from './search-ranking';

describe('ranking weights', () => {
  it('sums to 1 so rank_score stays in [0,1] and is comparable across searches', () => {
    const sum =
      DEFAULT_RANKING_WEIGHTS.relevance +
      DEFAULT_RANKING_WEIGHTS.proximity +
      DEFAULT_RANKING_WEIGHTS.trust;

    expect(sum).toBeCloseTo(1, 5);
  });

  it('keeps the no-location blend normalised too', () => {
    const sum =
      NO_LOCATION_RANKING_WEIGHTS.relevance +
      NO_LOCATION_RANKING_WEIGHTS.proximity +
      NO_LOCATION_RANKING_WEIGHTS.trust;

    expect(sum).toBeCloseTo(1, 5);
  });

  it('ranks relevance above trust, so the right trade always beats the trusted wrong one', () => {
    // A Tier 3 electrician is a wrong answer to "plumber". This ordering is the
    // guarantee that no amount of verification can make it a right one.
    expect(DEFAULT_RANKING_WEIGHTS.relevance).toBeGreaterThan(DEFAULT_RANKING_WEIGHTS.trust);
    expect(NO_LOCATION_RANKING_WEIGHTS.relevance).toBeGreaterThan(
      NO_LOCATION_RANKING_WEIGHTS.trust,
    );
  });

  it('drops proximity to zero without a location instead of scoring it neutral', () => {
    // The SQL scores proximity 1.0 for everyone when there is no origin. Left at
    // 0.3, that would add the same constant to every row and compress the two
    // signals that still mean something into 70% of the range.
    expect(weightsFor(false).proximity).toBe(0);
    expect(weightsFor(true).proximity).toBeGreaterThan(0);
  });

  it('preserves the relevance:trust ratio when redistributing proximity', () => {
    const withLocation = weightsFor(true);
    const without = weightsFor(false);

    expect(without.relevance / without.trust).toBeCloseTo(
      withLocation.relevance / withLocation.trust,
      1,
    );
  });
});

describe('normaliseSort', () => {
  it('accepts the supported modes', () => {
    expect(normaliseSort('distance')).toBe('distance');
    expect(normaliseSort('price')).toBe('price');
    expect(normaliseSort('trust')).toBe('trust');
  });

  it('falls back to relevance rather than erroring on junk', () => {
    // A bad sort value is not worth failing a search over: the user gets
    // results in the default order instead of an error page.
    expect(normaliseSort('nonsense')).toBe('relevance');
    expect(normaliseSort(null)).toBe('relevance');
    expect(normaliseSort(undefined)).toBe('relevance');
  });
});
