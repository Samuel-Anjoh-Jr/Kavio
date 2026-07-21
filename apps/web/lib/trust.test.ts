import { describe, expect, it } from 'vitest';
import {
  PILLAR_ORDER,
  orderedSubScores,
  pillarHeadroom,
  pillarImprovements,
  ringGeometry,
  subScoreRatio,
  tierPresentation,
  type TrustContribution,
  type TrustSubScore,
} from './trust';

function contribution(overrides: Partial<TrustContribution> = {}): TrustContribution {
  return {
    type: 'JOB_COMPLETED',
    occurrences: 1,
    points: 2,
    max: 10,
    maxed: false,
    improvementKey: 'Trust.improve.JOB_COMPLETED',
    ...overrides,
  };
}

function subScore(overrides: Partial<TrustSubScore> = {}): TrustSubScore {
  return {
    pillar: 'PROFESSIONAL',
    points: 10,
    max: 25,
    scored: true,
    contributions: [],
    ...overrides,
  };
}

describe('tierPresentation', () => {
  it('gives Tier 0 no icon and no verified mark (TRU-03)', () => {
    const presentation = tierPresentation('TIER_0');

    expect(presentation.icon).toBe('none');
    expect(presentation.tone).toBe('neutral');
    expect(presentation.showsVerifiedMark).toBe(false);
  });

  it('withholds the verified mark at Tier 1, where the ID is submitted but not approved', () => {
    expect(tierPresentation('TIER_1').showsVerifiedMark).toBe(false);
    expect(tierPresentation('TIER_2').showsVerifiedMark).toBe(true);
    expect(tierPresentation('TIER_3').showsVerifiedMark).toBe(true);
  });

  it('lets suspension override an earned tier entirely (TRU-08)', () => {
    const presentation = tierPresentation('TIER_3', true);

    expect(presentation.tone).toBe('danger');
    expect(presentation.icon).toBe('shield-alert');
    expect(presentation.showsVerifiedMark).toBe(false);
  });

  it('falls back to the Tier 0 treatment for an unrecognised tier', () => {
    // A tier added to the API before the web knows about it must degrade to
    // "unverified", never to a verified-looking default.
    const presentation = tierPresentation('TIER_9' as never);

    expect(presentation.showsVerifiedMark).toBe(false);
    expect(presentation.tone).toBe('neutral');
  });
});

describe('ringGeometry', () => {
  it('leaves the arc fully empty at zero and fully drawn at 100', () => {
    const empty = ringGeometry(0);
    const full = ringGeometry(100);

    expect(empty.offset).toBeCloseTo(empty.circumference);
    expect(full.offset).toBeCloseTo(0);
  });

  it('offsets half the circumference at 50', () => {
    const half = ringGeometry(50);

    expect(half.offset).toBeCloseTo(half.circumference / 2);
  });

  it('insets the radius by half the stroke so the ring is not clipped', () => {
    const { radius } = ringGeometry(50, 120, 10);

    expect(radius).toBe(55);
  });

  it('clamps out-of-range and non-finite scores', () => {
    expect(ringGeometry(140).value).toBe(100);
    expect(ringGeometry(-20).value).toBe(0);
    expect(ringGeometry(Number.NaN).value).toBe(0);
    expect(ringGeometry(Number.NaN).offset).toBeCloseTo(ringGeometry(0).circumference);
  });
});

describe('orderedSubScores', () => {
  it('returns all four pillars in SRS order regardless of API ordering', () => {
    const result = orderedSubScores([
      subScore({ pillar: 'MARKETPLACE' }),
      subScore({ pillar: 'IDENTITY' }),
    ]);

    expect(result.map((sub) => sub.pillar)).toEqual([...PILLAR_ORDER]);
  });

  it('fills a pillar the API omitted as unscored rather than dropping the card', () => {
    const result = orderedSubScores([subScore({ pillar: 'IDENTITY' })]);
    const financial = result.find((sub) => sub.pillar === 'FINANCIAL');

    expect(financial).toMatchObject({ points: 0, max: 0, scored: false, contributions: [] });
  });
});

describe('subScoreRatio', () => {
  it('is zero for an unscored pillar instead of dividing by zero', () => {
    expect(subScoreRatio({ points: 0, max: 0 })).toBe(0);
  });

  it('clamps a pillar that somehow overshot its ceiling', () => {
    expect(subScoreRatio({ points: 30, max: 25 })).toBe(1);
    expect(subScoreRatio({ points: 5, max: 20 })).toBe(0.25);
  });
});

describe('pillarImprovements', () => {
  it('ranks by points still available, largest first', () => {
    const result = pillarImprovements(
      subScore({
        contributions: [
          contribution({ type: 'PORTFOLIO_ADDED', points: 8, max: 10 }),
          contribution({ type: 'JOB_COMPLETED', points: 2, max: 20 }),
          contribution({ type: 'EXCELLENT_REVIEW', points: 1, max: 6 }),
        ],
      }),
    );

    expect(result.map((c) => c.type)).toEqual([
      'JOB_COMPLETED',
      'EXCELLENT_REVIEW',
      'PORTFOLIO_ADDED',
    ]);
  });

  it('drops maxed rules and penalties, which are not next actions', () => {
    const result = pillarImprovements(
      subScore({
        contributions: [
          contribution({
            type: 'PHONE_VERIFIED',
            points: 10,
            max: 10,
            maxed: true,
            improvementKey: null,
          }),
          contribution({ type: 'DISPUTE_UPHELD', points: -5, max: 0, improvementKey: null }),
          contribution({ type: 'JOB_COMPLETED' }),
        ],
      }),
    );

    expect(result.map((c) => c.type)).toEqual(['JOB_COMPLETED']);
  });
});

describe('pillarHeadroom', () => {
  it('reports the points left in a pillar, never negative', () => {
    expect(pillarHeadroom(subScore({ points: 10, max: 25 }))).toBe(15);
    expect(pillarHeadroom(subScore({ points: 30, max: 25 }))).toBe(0);
  });
});
