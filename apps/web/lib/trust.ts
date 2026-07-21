/**
 * Client-side trust contract and presentation rules (TRU-01, TRU-02, TRU-03).
 *
 * Mirrors apps/api/src/trust/models/trust.model.ts. The API returns numbers and
 * stable i18n KEYS and never returns display copy, so everything in this file is
 * about how a score and a tier LOOK — never what they say.
 *
 * The rule the whole module is built around: nothing here may make an
 * unverified profile look verified (TRU-03). That is why tone is derived from
 * the TIER and never from the score. A Tier 0 identity who has racked up 55
 * points from portfolio and endorsements has earned a real number, but not a
 * single verified check — colouring their ring success-green because the number
 * is high would be the exact implication TRU-03 forbids.
 */

export type VerificationTier = 'TIER_0' | 'TIER_1' | 'TIER_2' | 'TIER_3';

export type TrustPillar = 'IDENTITY' | 'PROFESSIONAL' | 'MARKETPLACE' | 'FINANCIAL';

/** Pillar render order — SRS §21.6, identity first, money last. */
export const PILLAR_ORDER: readonly TrustPillar[] = [
  'IDENTITY',
  'PROFESSIONAL',
  'MARKETPLACE',
  'FINANCIAL',
];

export interface TrustContribution {
  type: string;
  occurrences: number;
  points: number;
  max: number;
  maxed: boolean;
  /** i18n key for the "how to improve" line. Null once maxed or for penalties. */
  improvementKey: string | null;
}

export interface TrustSubScore {
  pillar: TrustPillar;
  points: number;
  max: number;
  /** False for a pillar with no scoring rules yet — render "coming soon", not a zero. */
  scored: boolean;
  contributions: TrustContribution[];
}

export interface TierRequirement {
  kind: string;
  checkType: string | null;
  labelKey: string;
  required: string;
  current: string;
}

export interface TierStatus {
  subjectId: string;
  tier: VerificationTier;
  labelKey: string;
  verified: boolean;
  nextTier: VerificationTier | null;
  requirements: TierRequirement[];
}

export interface TrustBreakdown {
  subjectId: string;
  total: number;
  tier: VerificationTier;
  suspended: boolean;
  subScores: TrustSubScore[];
  tierStatus: TierStatus;
  /** Ranked "do this next". Null when the viewer is not the subject or staff. */
  improvements: TrustContribution[] | null;
}

/**
 * The visual vocabulary a tier is allowed to use.
 *
 * `neutral` is not a fallback for "unknown" — it is the deliberate Tier 0
 * treatment. Grey with no icon is what an unverified profile looks like.
 */
export type TrustTone = 'neutral' | 'accent' | 'success' | 'primary' | 'danger';

export type TierIcon = 'none' | 'clock' | 'shield-check' | 'badge-check' | 'shield-alert';

export interface TierPresentation {
  tone: TrustTone;
  icon: TierIcon;
  /**
   * True only when the tier represents an APPROVED check. Tier 1 is "ID
   * submitted", which is a promise, not a verification — so it is false here
   * even though the API's `TierStatus.verified` (tier !== TIER_0) is true. The
   * two flags answer different questions: the API's asks "has this identity
   * moved off the floor", this one asks "may the UI show a verified mark".
   */
  showsVerifiedMark: boolean;
}

const TIER_PRESENTATION: Record<VerificationTier, TierPresentation> = {
  TIER_0: { tone: 'neutral', icon: 'none', showsVerifiedMark: false },
  TIER_1: { tone: 'accent', icon: 'clock', showsVerifiedMark: false },
  TIER_2: { tone: 'success', icon: 'shield-check', showsVerifiedMark: true },
  TIER_3: { tone: 'primary', icon: 'badge-check', showsVerifiedMark: true },
};

const SUSPENDED_PRESENTATION: TierPresentation = {
  tone: 'danger',
  icon: 'shield-alert',
  showsVerifiedMark: false,
};

/**
 * How a tier renders. `suspended` overrides everything: confirmed fraudulent
 * documents void the score (TRU-08), so whatever badge was previously earned
 * must stop being displayed the moment the suspension lands.
 */
export function tierPresentation(tier: VerificationTier, suspended = false): TierPresentation {
  if (suspended) return SUSPENDED_PRESENTATION;
  return TIER_PRESENTATION[tier] ?? TIER_PRESENTATION.TIER_0;
}

/** i18n key for a tier label. Tier 0 resolves to "Basic Profile" (TRU-03). */
export function tierLabelKey(tier: VerificationTier): string {
  return `tier.${tier}`;
}

export interface RingGeometry {
  /** Viewbox is square; this is one side. */
  size: number;
  radius: number;
  center: number;
  circumference: number;
  /** Stroke offset for the drawn arc. Full circumference = empty ring. */
  offset: number;
  /** The score clamped into [0, 100], i.e. what is actually drawn. */
  value: number;
}

/**
 * Arc maths for the Trust Score ring.
 *
 * Pure and separated from the component because it is the one part of a gauge
 * that can be silently wrong — an off-by-one on the radius reads as a ring
 * that never quite reaches 100.
 */
export function ringGeometry(score: number, size = 120, strokeWidth = 10): RingGeometry {
  // A NaN would poison the SVG attribute and blank the ring, so it lands at 0.
  const value = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  return {
    size,
    radius,
    center,
    circumference,
    offset: circumference * (1 - value / 100),
    value,
  };
}

/**
 * Sub-scores in a stable pillar order, with any pillar the API omitted filled in
 * as unscored. The screen must render four cards every time — a missing
 * Financial pillar becoming three cards would silently change the layout.
 */
export function orderedSubScores(subScores: readonly TrustSubScore[]): TrustSubScore[] {
  return PILLAR_ORDER.map(
    (pillar) =>
      subScores.find((sub) => sub.pillar === pillar) ?? {
        pillar,
        points: 0,
        max: 0,
        scored: false,
        contributions: [],
      },
  );
}

/** Fill ratio of a sub-score bar, 0–1. An unscored pillar is always empty. */
export function subScoreRatio(sub: Pick<TrustSubScore, 'points' | 'max'>): number {
  if (sub.max <= 0) return 0;
  return Math.min(1, Math.max(0, sub.points / sub.max));
}

/**
 * The actionable contributions of one pillar: things still worth points, best
 * first (TRU-04 "concrete steps to improve it").
 *
 * Maxed rules and penalties drop out. A penalty has `max: 0` and no
 * improvementKey — "get fewer disputes" is a scold, not a next action.
 */
export function pillarImprovements(sub: TrustSubScore): TrustContribution[] {
  return sub.contributions
    .filter((c) => c.improvementKey !== null && !c.maxed && c.max > 0)
    .sort((a, b) => b.max - b.points - (a.max - a.points));
}

/** Points still available in a pillar — the headroom shown next to its bar. */
export function pillarHeadroom(sub: TrustSubScore): number {
  return Math.max(0, sub.max - sub.points);
}
