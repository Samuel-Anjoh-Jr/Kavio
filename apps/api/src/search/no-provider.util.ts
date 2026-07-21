/**
 * Why a search came back empty (PROMPT 44; DIS-06).
 *
 * The requirement is that an empty result set is never rendered as an ambiguous
 * blank page — but "no providers for this service yet in your area" is only one
 * of several true answers, and saying it when the real cause was a 5,000 XAF
 * price cap is worse than saying nothing. It sends the user away from a
 * marketplace that could have served them.
 *
 * So the reason is decided HERE, server-side, from the probe counts, and the web
 * layer renders one localized message per reason. Deciding it in the client
 * would mean every surface that shows results re-implements this judgement, and
 * they would drift.
 */

/** Coded reason, so the EN/FR copy stays in the message catalogue (never here). */
export enum NoProviderReason {
  /** Results were found — the caller should render them normally. */
  NONE = 'NONE',
  /** Nobody offers this anywhere on the platform yet. */
  SERVICE_NOT_ON_PLATFORM = 'SERVICE_NOT_ON_PLATFORM',
  /** Providers exist, but none within the searched area. The DIS-06 headline. */
  NO_PROVIDERS_IN_AREA = 'NO_PROVIDERS_IN_AREA',
  /** Providers exist right here; the caller's own filters excluded them all. */
  FILTERED_OUT = 'FILTERED_OUT',
}

export interface ProviderProbe {
  /** Matches anywhere, ignoring area and filters. */
  matchesAnywhere: number;
  /** …of those, how many fall inside the searched radius. */
  matchesInArea: number;
  /** Distance to the nearest match beyond the radius, in metres. */
  nearestMatchM: number | null;
}

export interface NoProviderSignal {
  reason: NoProviderReason;
  /**
   * A radius, in metres, that WOULD return results — offered only when widening
   * is genuinely the fix. Null when a bigger radius would not help, so the UI
   * never shows a "search wider" button that leads to another empty page.
   */
  suggestedRadiusM: number | null;
  /** Distance to the nearest provider outside the radius, for honest copy. */
  nearestProviderM: number | null;
}

/**
 * Rounds a distance up to a radius worth offering.
 *
 * Suggesting the exact distance to the nearest match ("widen to 13,847 m") is
 * both ugly and brittle — one worker moving a street over makes the suggestion
 * return nothing. Rounding up to a human step leaves headroom and reads like
 * something a person would say.
 */
const RADIUS_STEPS_M = [1_000, 2_000, 5_000, 10_000, 15_000, 25_000, 50_000, 100_000];

export function suggestRadius(nearestMatchM: number): number | null {
  return RADIUS_STEPS_M.find((step) => step >= nearestMatchM) ?? null;
}

/**
 * Turns the probe into the signal the client renders.
 *
 * `hasFilters` matters because it is the only way to tell FILTERED_OUT from the
 * others: if matches exist in the area and the search still returned nothing,
 * something the caller asked for removed them.
 */
export function deriveNoProviderSignal(input: {
  resultCount: number;
  probe: ProviderProbe;
  hasFilters: boolean;
  hasLocation: boolean;
}): NoProviderSignal {
  const { probe } = input;

  if (input.resultCount > 0) {
    return { reason: NoProviderReason.NONE, suggestedRadiusM: null, nearestProviderM: null };
  }

  if (probe.matchesAnywhere === 0) {
    // Nobody, nowhere. Widening the radius cannot help, so no suggestion is
    // offered — this is the cold-start case, and the honest response is to
    // invite the user to tell us what they needed.
    return {
      reason: NoProviderReason.SERVICE_NOT_ON_PLATFORM,
      suggestedRadiusM: null,
      nearestProviderM: null,
    };
  }

  if (probe.matchesInArea > 0) {
    // They are here and we still returned nothing, so the caller's own filters
    // are what removed them. Reported even when `hasFilters` is false: that
    // combination means a filter we did not account for is silently narrowing
    // results, and mislabelling it "none in your area" would hide the bug.
    return {
      reason: NoProviderReason.FILTERED_OUT,
      suggestedRadiusM: null,
      nearestProviderM: null,
    };
  }

  // Matches exist, none in range: the DIS-06 headline case.
  const nearest = probe.nearestMatchM;

  return {
    reason: NoProviderReason.NO_PROVIDERS_IN_AREA,
    // Without a location there is no radius to widen, so there is nothing to
    // suggest even though the reason is right.
    suggestedRadiusM: input.hasLocation && nearest !== null ? suggestRadius(nearest) : null,
    nearestProviderM: nearest,
  };
}
