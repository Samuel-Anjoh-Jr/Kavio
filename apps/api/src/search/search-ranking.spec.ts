import {
  applySponsoredSlots,
  DEFAULT_RANKING_WEIGHTS,
  NO_LOCATION_RANKING_WEIGHTS,
  normaliseSort,
  type SponsoredCandidate,
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

describe('applySponsoredSlots', () => {
  interface Worker {
    userId: string;
  }

  function workers(count: number): Worker[] {
    return Array.from({ length: count }, (_, i) => ({ userId: `w${i}` }));
  }

  function candidate(
    userId: string,
    lastShownAt: Date | null = null,
  ): [string, SponsoredCandidate] {
    return [userId, { userId, lastShownAt }];
  }

  it('is a no-op with an empty sponsor map', () => {
    const page = workers(10);
    const result = applySponsoredSlots(page, new Map());

    expect(result.shownUserIds).toEqual([]);
    expect(result.workers.map((w) => w.userId)).toEqual(page.map((w) => w.userId));
    expect(result.workers.every((w) => w.sponsored === false)).toBe(true);
  });

  it('is a no-op on a page too short to interleave into (< 3 workers)', () => {
    const page = workers(2);
    const sponsored = new Map([candidate('w0')]);
    const result = applySponsoredSlots(page, sponsored);

    expect(result.shownUserIds).toEqual([]);
    expect(result.workers.every((w) => w.sponsored === false)).toBe(true);
  });

  it('respects the cap when there are more eligible sponsors than slots', () => {
    // 20 workers -> cap = floor(20/5) = 4. Half are sponsored (10), well over
    // the cap, with plenty of organic results left to interleave into.
    const page = workers(20);
    const sponsored = new Map(page.slice(0, 10).map((w) => candidate(w.userId)));

    const result = applySponsoredSlots(page, sponsored);

    expect(result.shownUserIds.length).toBe(4);
    expect(result.workers.filter((w) => w.sponsored).length).toBe(4);
  });

  it('prefers never-shown (null lastShownAt) sponsors over older-shown ones when trimming to the cap', () => {
    const page = workers(10); // cap = max(1, floor(10/5)) = 2
    const sponsored = new Map([
      candidate('w0', new Date('2026-01-01')),
      candidate('w1', new Date('2026-01-05')),
      candidate('w2', null),
      candidate('w3', new Date('2026-01-03')),
    ]);

    const result = applySponsoredSlots(page, sponsored);

    expect(result.shownUserIds).toEqual(['w2', 'w0']);
  });

  it('keeps eligible sponsors in their already-ranked order when all fit under the cap', () => {
    const page = workers(20); // cap = 4
    // Only two eligible — well under the cap — with lastShownAt values that
    // would reorder them if the rotation sort were (wrongly) applied anyway.
    const sponsored = new Map([
      candidate('w5', new Date('2026-01-09')),
      candidate('w1', new Date('2026-01-01')),
    ]);

    const result = applySponsoredSlots(page, sponsored);

    // w1 precedes w5 in the original ranked order, and must still precede it
    // among the sponsored slots.
    expect(result.shownUserIds).toEqual(['w1', 'w5']);
  });

  it('never places more than one sponsored slot, and never at position 1 or 2, on a short page', () => {
    // One sponsored candidate among otherwise-organic results — the realistic
    // shape of a short page, as opposed to every result being a sponsor.
    for (const size of [3, 4, 5]) {
      const page = workers(size);
      const sponsored = new Map([candidate(page[0]!.userId)]);

      const result = applySponsoredSlots(page, sponsored);
      const sponsoredIndices = result.workers
        .map((w, i) => (w.sponsored ? i : -1))
        .filter((i) => i !== -1);

      expect(sponsoredIndices.length).toBeLessThanOrEqual(1);
      for (const index of sponsoredIndices) {
        expect(index).toBeGreaterThan(1);
      }
    }
  });

  it('places at most one slot, never at position 1, when there is too little organic content to interleave into', () => {
    // Every worker on the page is sponsored: fewer than 2 organic results
    // remain, so only one sponsored slot is offered, at the earliest position
    // the rest of the page allows.
    const page = workers(3);
    const sponsored = new Map(page.map((w) => candidate(w.userId)));

    const result = applySponsoredSlots(page, sponsored);

    expect(result.shownUserIds.length).toBe(1);
    expect(result.workers.filter((w) => w.sponsored).length).toBe(1);
  });

  it('never tags a worker who was not already in the original results', () => {
    const page = workers(15);
    const sponsored = new Map([
      candidate('w2'),
      candidate('w9'),
      candidate('ghost-not-in-results'),
    ]);

    const result = applySponsoredSlots(page, sponsored);
    const originalIds = new Set(page.map((w) => w.userId));

    for (const id of result.shownUserIds) {
      expect(originalIds.has(id)).toBe(true);
    }
    expect(result.workers.every((w) => originalIds.has(w.userId))).toBe(true);
    expect(result.workers.length).toBe(page.length);
  });

  it('never reorders the organic results relative to each other', () => {
    const page = workers(20);
    const sponsored = new Map([candidate('w3'), candidate('w14')]);

    const result = applySponsoredSlots(page, sponsored);
    const organicOrder = result.workers.filter((w) => !w.sponsored).map((w) => w.userId);
    const expectedOrganicOrder = page.map((w) => w.userId).filter((id) => !sponsored.has(id));

    expect(organicOrder).toEqual(expectedOrganicOrder);
  });
});
