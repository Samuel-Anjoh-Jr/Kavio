import {
  deriveNoProviderSignal,
  NoProviderReason,
  suggestRadius,
  type ProviderProbe,
} from './no-provider.util';

const EMPTY_PROBE: ProviderProbe = { matchesAnywhere: 0, matchesInArea: 0, nearestMatchM: null };

describe('suggestRadius', () => {
  it('rounds up to the next human-sized step', () => {
    expect(suggestRadius(3_400)).toBe(5_000);
    expect(suggestRadius(12_000)).toBe(15_000);
  });

  it('leaves headroom rather than suggesting the exact distance', () => {
    // Suggesting exactly 5,000 m for a match at 5,000 m is a coin flip that one
    // rounding error turns into a second empty page.
    expect(suggestRadius(4_999)).toBe(5_000);
    expect(suggestRadius(5_001)).toBe(10_000);
  });

  it('returns null beyond the largest step, instead of an unusable radius', () => {
    expect(suggestRadius(500_000)).toBeNull();
  });
});

describe('deriveNoProviderSignal', () => {
  it('reports NONE when there are results', () => {
    const signal = deriveNoProviderSignal({
      resultCount: 5,
      probe: EMPTY_PROBE,
      hasFilters: true,
      hasLocation: true,
    });

    expect(signal.reason).toBe(NoProviderReason.NONE);
    expect(signal.suggestedRadiusM).toBeNull();
  });

  it('reports SERVICE_NOT_ON_PLATFORM when nobody offers it anywhere', () => {
    const signal = deriveNoProviderSignal({
      resultCount: 0,
      probe: EMPTY_PROBE,
      hasFilters: false,
      hasLocation: true,
    });

    expect(signal.reason).toBe(NoProviderReason.SERVICE_NOT_ON_PLATFORM);
    // Widening cannot conjure a provider that does not exist, so no false hope.
    expect(signal.suggestedRadiusM).toBeNull();
  });

  it('reports NO_PROVIDERS_IN_AREA with a widening suggestion — the DIS-06 case', () => {
    const signal = deriveNoProviderSignal({
      resultCount: 0,
      probe: { matchesAnywhere: 4, matchesInArea: 0, nearestMatchM: 12_400 },
      hasFilters: false,
      hasLocation: true,
    });

    expect(signal.reason).toBe(NoProviderReason.NO_PROVIDERS_IN_AREA);
    expect(signal.suggestedRadiusM).toBe(15_000);
    expect(signal.nearestProviderM).toBe(12_400);
  });

  it('offers no radius suggestion when the searcher has no location', () => {
    // The reason is still right — they exist, just not reachable from here —
    // but there is no radius to widen, so a "search wider" button would do
    // nothing when tapped.
    const signal = deriveNoProviderSignal({
      resultCount: 0,
      probe: { matchesAnywhere: 4, matchesInArea: 0, nearestMatchM: 12_400 },
      hasFilters: false,
      hasLocation: false,
    });

    expect(signal.reason).toBe(NoProviderReason.NO_PROVIDERS_IN_AREA);
    expect(signal.suggestedRadiusM).toBeNull();
  });

  it('blames the filters, not the area, when providers are right here', () => {
    // Telling this user "no plumbers in your area" would be a lie that sends
    // them away from a city full of plumbers they priced themselves out of.
    const signal = deriveNoProviderSignal({
      resultCount: 0,
      probe: { matchesAnywhere: 20, matchesInArea: 12, nearestMatchM: null },
      hasFilters: true,
      hasLocation: true,
    });

    expect(signal.reason).toBe(NoProviderReason.FILTERED_OUT);
  });

  it('still reports FILTERED_OUT when the caller claims no filters', () => {
    // Matches in the area plus an empty page means something narrowed the
    // results that we did not count as a filter. Surfacing that as "none in
    // your area" would bury a real bug behind plausible copy.
    const signal = deriveNoProviderSignal({
      resultCount: 0,
      probe: { matchesAnywhere: 20, matchesInArea: 12, nearestMatchM: null },
      hasFilters: false,
      hasLocation: true,
    });

    expect(signal.reason).toBe(NoProviderReason.FILTERED_OUT);
  });
});
