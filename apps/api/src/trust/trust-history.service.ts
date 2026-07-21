import { HttpStatus, Injectable } from '@nestjs/common';
import { Role, type BadgeType, type TrustEventType } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { PrismaService } from '../prisma/prisma.service';

/** What kind of thing happened, so the timeline can render each row properly. */
export type TrustHistoryKind = 'SCORE_EVENT' | 'BADGE' | 'TIER_CHANGE';

export interface TrustHistoryEntry {
  readonly id: string;
  readonly kind: TrustHistoryKind;
  readonly occurredAt: Date;
  /** i18n key for the headline. The API never returns a sentence. */
  readonly labelKey: string;
  /** The scored signal, for SCORE_EVENT rows. */
  readonly eventType: TrustEventType | null;
  /** The badge, for BADGE rows. */
  readonly badge: BadgeType | null;
  /** Nominal point impact recorded at the time, for SCORE_EVENT rows. */
  readonly delta: number | null;
  /** Tier the identity moved to, for TIER_CHANGE rows. */
  readonly tier: string | null;
}

/** Default page size for the timeline. */
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * The trust-history timeline (P32; TRU-11).
 *
 * "Trust Score changes shall be event-driven, auditable, and shown as a trust
 * history timeline to the owner." Three sources make that one story:
 *   TrustEvent  what was scored and when
 *   UserBadge   what was unlocked
 *   AuditLog    tier movements, already written by the tier service
 *
 * OWNER-ONLY (plus staff). The public gets the score, the tier and the pillars —
 * that transparency is the product — but a dated log of every setback and
 * dispute is the subject's own history, not a stranger's browsing material.
 */
@Injectable()
export class TrustHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async timeline(
    subjectId: string,
    viewer: AuthenticatedUser | undefined,
    limit = DEFAULT_LIMIT,
  ): Promise<TrustHistoryEntry[]> {
    this.assertMayView(subjectId, viewer);

    const take = Math.min(limit, MAX_LIMIT);

    const [events, badges, tierChanges] = await Promise.all([
      this.prisma.client.trustEvent.findMany({
        where: { subjectId },
        select: { id: true, type: true, delta: true, occurredAt: true },
        orderBy: { occurredAt: 'desc' },
        take,
      }),
      this.prisma.client.userBadge.findMany({
        where: { subjectId },
        select: { id: true, type: true, awardedAt: true },
        orderBy: { awardedAt: 'desc' },
        take,
      }),
      this.prisma.client.auditLog.findMany({
        where: { action: 'trust.tier.changed', target: `User:${subjectId}` },
        select: { id: true, meta: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ]);

    const entries: TrustHistoryEntry[] = [
      ...events.map((event) => ({
        id: event.id,
        kind: 'SCORE_EVENT' as const,
        occurredAt: event.occurredAt,
        labelKey: `TrustHistory.event.${event.type}`,
        eventType: event.type,
        badge: null,
        delta: event.delta,
        tier: null,
      })),
      ...badges.map((badge) => ({
        id: badge.id,
        kind: 'BADGE' as const,
        occurredAt: badge.awardedAt,
        labelKey: `TrustHistory.badge.unlocked`,
        eventType: null,
        badge: badge.type,
        delta: null,
        tier: null,
      })),
      ...tierChanges.map((entry) => {
        const meta = (entry.meta ?? {}) as { tier?: string; direction?: string };
        return {
          id: entry.id,
          kind: 'TIER_CHANGE' as const,
          occurredAt: entry.createdAt,
          // Promotion and demotion read very differently; the key carries which.
          labelKey: `TrustHistory.tier.${meta.direction ?? 'PROMOTED'}`,
          eventType: null,
          badge: null,
          delta: null,
          tier: meta.tier ?? null,
        };
      }),
    ];

    // Merged in memory: three already-bounded, already-indexed queries beat one
    // clever UNION, and the whole page is at most 3 × `take` rows.
    return entries.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, take);
  }

  private assertMayView(subjectId: string, viewer: AuthenticatedUser | undefined): void {
    if (!viewer) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Sign in to see this trust history.',
      );
    }

    const allowed =
      viewer.id === subjectId ||
      viewer.activeRole === Role.ADMIN ||
      viewer.activeRole === Role.AGENT;

    if (!allowed) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'TRUST_HISTORY_PRIVATE',
        'A trust history is only visible to the person it belongs to.',
      );
    }
  }
}
