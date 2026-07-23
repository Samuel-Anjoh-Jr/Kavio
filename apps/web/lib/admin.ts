'use client';

import type { StatusTone } from '@/components/ui/status-badge';
import { restPatch, restPost } from '@/lib/rest-api';
import type { AnnouncementAudience, AnnouncementStatus, RiskLevel } from '@/lib/graphql/admin';

/**
 * Admin console vocabulary + WRITES (ADM-02, ADM-06, ADM-07). Reads are GraphQL
 * (lib/graphql/admin.ts).
 *
 * ── What is NOT here ────────────────────────────────────────────────────────
 *
 * Suspend, ban and reinstate. Those are moderation actions and they live in
 * lib/reports.ts, which posts to the moderation endpoint that writes an
 * append-only ModerationAction with a reason and notifies the person affected.
 * The risk monitor links to that flow rather than shipping a quieter one.
 */

/** Windows the API accepts. Anything else is refused server-side. */
export const ADMIN_WINDOWS = [7, 30, 90, 365] as const;
export type AdminWindow = (typeof ADMIN_WINDOWS)[number];

export const RISK_LEVEL_TONE: Record<RiskLevel, StatusTone> = {
  HIGH: 'danger',
  ELEVATED: 'warning',
  LOW: 'neutral',
};

export const ANNOUNCEMENT_STATUS_TONE: Record<AnnouncementStatus, StatusTone> = {
  PUBLISHED: 'success',
  DRAFT: 'neutral',
  ARCHIVED: 'neutral',
};

export const AGENT_INVITATION_TONE: Record<string, StatusTone> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  EXPIRED: 'neutral',
  REVOKED: 'neutral',
};

/**
 * Mirrors the API's ADMIN_ADJUSTMENT_MAX_MAGNITUDE (trust-score.model.ts) so
 * the form stops the admin before the server has to.
 */
export const TRUST_ADJUSTMENT_MAX_MAGNITUDE = 25;

/**
 * An exceptional Trust Score adjustment (ADM-04): a fraud penalty or a
 * Field-Verified bonus, applied as an explicit, auditable TrustEvent. Gated on
 * `admin:trust_adjust` — a permission held only by ADMIN, deliberately separate
 * from `admin:verification_review` so clearing the queue never implies the power
 * to move a score by hand.
 */
export function adjustTrustScore(
  subjectId: string,
  delta: number,
  reason: string,
): Promise<{ subjectId: string; delta: number; total: number }> {
  return restPost<{ subjectId: string; delta: number; total: number }>('admin/trust/adjustments', {
    subjectId,
    delta,
    reason,
  });
}

export const USER_STATUS_TONE: Record<string, StatusTone> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  SUSPENDED: 'danger',
  DELETED: 'neutral',
};

export const ANNOUNCEMENT_AUDIENCES: readonly AnnouncementAudience[] = [
  'ALL',
  'WORKERS',
  'CLIENTS',
  'BUSINESSES',
  'AGENTS',
];

// ── Agent invitations (ADM-06) ──────────────────────────────────────────────

export interface InviteAgentInput {
  name: string;
  email: string;
  phone?: string;
  note?: string;
}

export function inviteAgent(input: InviteAgentInput): Promise<{ id: string }> {
  return restPost<{ id: string }>('admin/agent-invitations', input);
}

export function revokeAgentInvitation(id: string): Promise<{ id: string }> {
  return restPost<{ id: string }>(`admin/agent-invitations/${id}/revoke`);
}

export function acceptAgentInvitation(input: {
  token: string;
  password: string;
  name?: string;
}): Promise<{ userId: string }> {
  return restPost<{ userId: string }>('admin/agent-invitations/accept', input);
}

// ── Announcements (ADM-07) ──────────────────────────────────────────────────

export interface AnnouncementInput {
  titleEn: string;
  titleFr: string;
  bodyEn: string;
  bodyFr: string;
  audience: AnnouncementAudience;
  expiresAt?: string;
}

export function createAnnouncement(input: AnnouncementInput): Promise<{ id: string }> {
  return restPost<{ id: string }>('admin/announcements', input);
}

export function updateAnnouncement(
  id: string,
  input: Partial<AnnouncementInput> & { status?: AnnouncementStatus },
): Promise<{ id: string }> {
  return restPatch<{ id: string }>(`admin/announcements/${id}`, input);
}

// ── Settings (ADM-07) ───────────────────────────────────────────────────────

export function updateSetting(key: string, value: unknown): Promise<{ key: string }> {
  return restPatch<{ key: string }>(`admin/settings/${encodeURIComponent(key)}`, { value });
}

// ── Export (ADM-07) ─────────────────────────────────────────────────────────

/**
 * Turns rows into a CSV blob and downloads it.
 *
 * The export is built in the BROWSER from the analytics query the screen already
 * holds, rather than from a server-side report endpoint. That is deliberate: a
 * separate exporter would be a second implementation of every aggregate on the
 * screen, free to drift from it, and an export that disagrees with the dashboard
 * it came from is worse than no export at all.
 */
export function downloadCsv(filename: string, rows: (string | number | null)[][]): void {
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return '';
          const text = String(cell);
          // Quote anything that could break the row, and double interior quotes.
          return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(','),
    )
    .join('\r\n');

  // The BOM is not decoration: Excel reads a UTF-8 CSV as the local codepage
  // without it, which turns every French accent in a category name into mojibake.
  const blob = new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}
