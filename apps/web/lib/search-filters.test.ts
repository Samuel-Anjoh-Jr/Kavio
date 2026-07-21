import { describe, expect, it } from 'vitest';
import { DEFAULT_RADIUS_M, MAX_RADIUS_M } from './geo';
import {
  activeFilterCount,
  clearFilters,
  EMPTY_FILTERS,
  PAGE_SIZE,
  parseFilters,
  serialiseFilters,
  toSearchVariables,
  type SearchFilters,
} from './search-filters';

function parse(querystring: string): SearchFilters {
  return parseFilters(new URLSearchParams(querystring));
}

describe('parseFilters', () => {
  it('reads a full filter set out of the URL', () => {
    const filters = parse(
      'q=plombier&cat=plumbing&lat=4.0511&lng=9.7679&r=3000&pmin=5000&pmax=50000&trust=60&tier=TIER_2&rating=4&verified=1&day=3&time=14:30&sort=distance',
    );

    expect(filters).toMatchObject({
      query: 'plombier',
      categorySlug: 'plumbing',
      latitude: 4.0511,
      longitude: 9.7679,
      radiusM: 3000,
      minPrice: 5000,
      maxPrice: 50000,
      minTrustScore: 60,
      minTier: 'TIER_2',
      minRating: 4,
      verifiedOnly: true,
      availableDay: 3,
      availableTime: '14:30',
      sort: 'distance',
    });
  });

  it('falls back to unset for values it cannot trust', () => {
    const filters = parse(
      'cat=DROP%20TABLE&tier=TIER_9&sort=cheapest&trust=900&rating=11&time=99:99&date=yesterday',
    );

    expect(filters.categorySlug).toBeNull();
    expect(filters.minTier).toBeNull();
    expect(filters.sort).toBe('relevance');
    expect(filters.minTrustScore).toBeNull();
    expect(filters.minRating).toBeNull();
    expect(filters.availableTime).toBeNull();
    expect(filters.availableDate).toBeNull();
  });

  it('drops a half-specified origin rather than searching from a bogus point', () => {
    expect(parse('lat=4.0511').latitude).toBeNull();
    expect(parse('lng=9.7679').longitude).toBeNull();
  });

  it('clamps the radius to the bounds the API applies', () => {
    expect(parse('lat=4.05&lng=9.76&r=99999999').radiusM).toBe(MAX_RADIUS_M);
    expect(parse('').radiusM).toBe(DEFAULT_RADIUS_M);
  });

  it('rights an inverted price range instead of returning nothing', () => {
    const filters = parse('pmin=90000&pmax=1000');
    expect(filters.minPrice).toBe(1000);
    expect(filters.maxPrice).toBe(90000);
  });

  it('bounds the page size so a hand-edited link cannot become a scrape', () => {
    expect(parse('n=100000').limit).toBe(PAGE_SIZE);
    expect(parse('n=40').limit).toBe(40);
  });

  it('reads Next.js searchParams objects as well as URLSearchParams', () => {
    expect(parseFilters({ q: 'welder', verified: '1' })).toMatchObject({
      query: 'welder',
      verifiedOnly: true,
    });
    // Repeated params arrive as arrays; the first wins.
    expect(parseFilters({ q: ['welder', 'plumber'] }).query).toBe('welder');
  });
});

describe('serialiseFilters', () => {
  it('omits defaults so one search produces one URL', () => {
    expect(serialiseFilters(EMPTY_FILTERS)).toBe('');
    expect(serialiseFilters({ ...EMPTY_FILTERS, query: 'welder' })).toBe('q=welder');
  });

  it('round-trips a filter set unchanged', () => {
    const querystring =
      'q=plombier&cat=plumbing&lat=4.0511&lng=9.7679&r=3000&pmin=5000&trust=60&tier=TIER_2&verified=1&sort=distance';
    expect(serialiseFilters(parse(querystring))).toBe(new URLSearchParams(querystring).toString());
  });

  it('never emits a radius without an origin for it to apply to', () => {
    const encoded = serialiseFilters({ ...EMPTY_FILTERS, radiusM: 3000 });
    expect(encoded).not.toContain('r=');
  });
});

describe('activeFilterCount', () => {
  it('is zero for a plain text search', () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, query: 'plumber', sort: 'distance' })).toBe(0);
  });

  it('counts a location once, not once per coordinate', () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, latitude: 4.05, longitude: 9.76 })).toBe(1);
  });

  it('counts a price range once whichever end is set', () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, minPrice: 5000 })).toBe(1);
    expect(activeFilterCount({ ...EMPTY_FILTERS, minPrice: 5000, maxPrice: 50000 })).toBe(1);
  });

  it('sums the distinct filters applied', () => {
    const filters: SearchFilters = {
      ...EMPTY_FILTERS,
      categorySlug: 'plumbing',
      verifiedOnly: true,
      minTrustScore: 60,
    };
    expect(activeFilterCount(filters)).toBe(3);
  });
});

describe('clearFilters', () => {
  it('keeps what the user is looking for and where, and drops the rest', () => {
    const cleared = clearFilters({
      ...EMPTY_FILTERS,
      query: 'welder',
      latitude: 4.05,
      longitude: 9.76,
      radiusM: 3000,
      sort: 'distance',
      verifiedOnly: true,
      categorySlug: 'welding',
    });

    expect(cleared.query).toBe('welder');
    expect(cleared.latitude).toBe(4.05);
    expect(cleared.radiusM).toBe(3000);
    expect(cleared.sort).toBe('distance');
    expect(cleared.verifiedOnly).toBe(false);
    expect(cleared.categorySlug).toBeNull();
  });
});

describe('toSearchVariables', () => {
  it('omits unset filters entirely rather than sending nulls', () => {
    const variables = toSearchVariables({ ...EMPTY_FILTERS, query: 'welder' });

    expect(variables).toEqual({ limit: PAGE_SIZE, offset: 0, sort: 'relevance', query: 'welder' });
    expect('verifiedOnly' in variables).toBe(false);
  });

  it('sends the radius only alongside a usable origin', () => {
    expect(toSearchVariables({ ...EMPTY_FILTERS, radiusM: 3000 }).radiusM).toBeUndefined();

    const located = toSearchVariables({
      ...EMPTY_FILTERS,
      latitude: 4.05,
      longitude: 9.76,
      radiusM: 3000,
    });
    expect(located).toMatchObject({ latitude: 4.05, longitude: 9.76, radiusM: 3000 });
  });
});
