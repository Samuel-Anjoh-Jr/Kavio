'use client';

import type { StatusTone } from '@/components/ui/status-badge';
import { restPost } from '@/lib/rest-api';

/**
 * Reporting & moderation vocabulary + WRITES (ADM-08). Reads are GraphQL
 * (lib/graphql/moderation.ts). Reporting anything a user can see is the write;
 * the grouped admin queue and the actions on a party are the rest.
 */

/** What a report can point at. Mirrors the API's ReportTargetType. */
export type ReportTargetType =
  | 'USER'
  | 'WORKER_PROFILE'
  | 'BUSINESS_PROFILE'
  | 'JOB'
  | 'PORTFOLIO_ITEM'
  | 'MEDIA_ASSET'
  | 'REVIEW'
  | 'QUOTE'
  | 'MESSAGE'
  | 'CONVERSATION';

export type ReportReason =
  | 'SPAM'
  | 'HARASSMENT'
  | 'SCAM'
  | 'INAPPROPRIATE'
  | 'OFF_PLATFORM'
  | 'FAKE_PROFILE'
  | 'STOLEN_CONTENT'
  | 'MISLEADING'
  | 'ILLEGAL'
  | 'OTHER';

export type AbuseReportStatus = 'OPEN' | 'REVIEWING' | 'ACTIONED' | 'DISMISSED';

export type ModerationActionType =
  'WARN' | 'CONTENT_REMOVED' | 'SUSPEND' | 'BAN' | 'REINSTATE' | 'DISMISS';

/**
 * The reasons offered for each kind of target (ADM-08).
 *
 * A person reporting a profile is thinking "this is fake", not "this is spam", so
 * the list is scoped to what actually applies — a shorter, truer set of choices
 * than one universal menu. OTHER always closes it out for the case the list
 * missed.
 */
export const REASONS_BY_TARGET: Record<ReportTargetType, readonly ReportReason[]> = {
  USER: ['HARASSMENT', 'SCAM', 'FAKE_PROFILE', 'INAPPROPRIATE', 'ILLEGAL', 'OTHER'],
  WORKER_PROFILE: [
    'FAKE_PROFILE',
    'SCAM',
    'STOLEN_CONTENT',
    'MISLEADING',
    'INAPPROPRIATE',
    'OTHER',
  ],
  BUSINESS_PROFILE: ['FAKE_PROFILE', 'SCAM', 'MISLEADING', 'ILLEGAL', 'OTHER'],
  JOB: ['SCAM', 'MISLEADING', 'INAPPROPRIATE', 'OFF_PLATFORM', 'ILLEGAL', 'OTHER'],
  PORTFOLIO_ITEM: ['STOLEN_CONTENT', 'MISLEADING', 'INAPPROPRIATE', 'OTHER'],
  MEDIA_ASSET: ['STOLEN_CONTENT', 'INAPPROPRIATE', 'ILLEGAL', 'OTHER'],
  REVIEW: ['HARASSMENT', 'SPAM', 'MISLEADING', 'INAPPROPRIATE', 'OTHER'],
  QUOTE: ['SCAM', 'OFF_PLATFORM', 'MISLEADING', 'OTHER'],
  MESSAGE: ['HARASSMENT', 'SPAM', 'SCAM', 'OFF_PLATFORM', 'INAPPROPRIATE', 'OTHER'],
  CONVERSATION: ['HARASSMENT', 'SPAM', 'SCAM', 'OFF_PLATFORM', 'INAPPROPRIATE', 'OTHER'],
};

export const REPORT_STATUS_TONE: Record<AbuseReportStatus, StatusTone> = {
  OPEN: 'warning',
  REVIEWING: 'primary',
  ACTIONED: 'success',
  DISMISSED: 'neutral',
};

export const MODERATION_ACTION_TONE: Record<ModerationActionType, StatusTone> = {
  WARN: 'warning',
  CONTENT_REMOVED: 'warning',
  SUSPEND: 'danger',
  BAN: 'danger',
  REINSTATE: 'success',
  DISMISS: 'neutral',
};

export interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
  /** Only for targets with no derivable owner (a conversation has two members). */
  reportedUserId?: string;
}

export function createReport(input: CreateReportInput): Promise<{ id: string; status: string }> {
  return restPost('reports', input);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin moderation writes (ADM-08)
// ─────────────────────────────────────────────────────────────────────────────

export function reviewReportGroup(input: {
  targetType: ReportTargetType;
  targetId: string;
  status: 'REVIEWING' | 'OPEN';
  reviewNote?: string;
}): Promise<{ updated: number }> {
  return restPost('admin/moderation/review', input);
}

export interface ModerationActionInput {
  action: ModerationActionType;
  targetType?: ReportTargetType;
  targetId?: string;
  subjectUserId?: string;
  reason: string;
  internalNote?: string;
  suspendDays?: number;
}

export function takeModerationAction(
  input: ModerationActionInput,
): Promise<{ id: string; reportsClosed: number; contentRemoved: boolean }> {
  return restPost('admin/moderation/actions', input);
}

/** Which actions a case offers, given whether its item can be taken down. */
export function actionsFor(removable: boolean): ModerationActionType[] {
  const base: ModerationActionType[] = ['WARN', 'SUSPEND', 'BAN', 'DISMISS'];
  return removable ? ['CONTENT_REMOVED', ...base] : base;
}
