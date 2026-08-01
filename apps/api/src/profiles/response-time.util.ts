/**
 * Worker response-time stat (PRO-01), computed from real JobInvitation timestamps.
 *
 * This is deliberately NOT the same thing as `responseTimeAvailable` in
 * SearchFiltersService: that flag gates a marketplace-WIDE search filter, which
 * genuinely has no data source until the Phase 5 messaging module lands. This
 * stat is narrower and answerable today — a client-sent JobInvitation already
 * carries `createdAt`, and `respondedAt` is set the moment the invited worker
 * accepts or declines it (InvitationsService#respond). The gap between the two
 * is a real, worker-attributable response time, not a proxy.
 *
 * Declined invitations count exactly like accepted ones: this measures whether
 * the worker showed up to answer, not what they answered.
 */

/** Below this many answered invitations, a median is one lucky (or unlucky) data point, not a signal. */
export const MIN_INVITATIONS_FOR_RESPONSE_STAT = 3;

export interface RespondedInvitation {
  createdAt: Date;
  respondedAt: Date;
}

export interface ResponseTimeStat {
  /** Median minutes to respond. Null until `scored` is true. */
  respondsWithinMinutes: number | null;
  scored: boolean;
}

export function computeResponseTimeStat(invitations: RespondedInvitation[]): ResponseTimeStat {
  if (invitations.length < MIN_INVITATIONS_FOR_RESPONSE_STAT) {
    return { respondsWithinMinutes: null, scored: false };
  }

  const minutes = invitations
    .map((invitation) =>
      Math.max(0, (invitation.respondedAt.getTime() - invitation.createdAt.getTime()) / 60_000),
    )
    .sort((a, b) => a - b);

  const mid = Math.floor(minutes.length / 2);
  const median =
    minutes.length % 2 === 0
      ? ((minutes[mid - 1] as number) + (minutes[mid] as number)) / 2
      : (minutes[mid] as number);

  return { respondsWithinMinutes: Math.round(median), scored: true };
}
