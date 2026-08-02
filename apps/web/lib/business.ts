'use client';

import type { StatusTone } from '@/components/ui/status-badge';
import { restDelete, restPatch, restPost } from '@/lib/rest-api';

/**
 * Business & team vocabulary + WRITES (BIZ-01, BIZ-03). Reads are GraphQL
 * (lib/graphql/business.ts).
 *
 * `roles` and `accessLevel` are separate concepts and stay separate here.
 * `roles` are HR labels on somebody's seat — a seat can hold more than one;
 * `accessLevel` is what the server actually enforces. Deriving one from the
 * other would look tidy and would mean renaming a job title silently changed
 * what that person can spend.
 */

/** The HR label. Not a permission. Mirrors the API's TeamMemberRole. */
export type TeamMemberRole = 'ADMIN' | 'HR_MANAGER' | 'ACCOUNTANT' | 'STAFF';

/** What the server enforces. Mirrors the API's TeamMemberAccessLevel. */
export type TeamAccessLevel = 'FULL' | 'MANAGE_JOBS' | 'PAYMENTS' | 'VIEW_ONLY';

export type TeamMemberStatus = 'INVITED' | 'ACTIVE' | 'REMOVED' | 'DECLINED';

export const TEAM_ROLES: readonly TeamMemberRole[] = ['ADMIN', 'HR_MANAGER', 'ACCOUNTANT', 'STAFF'];

export const TEAM_ACCESS_LEVELS: readonly TeamAccessLevel[] = [
  'FULL',
  'MANAGE_JOBS',
  'PAYMENTS',
  'VIEW_ONLY',
];

export const TEAM_STATUS_TONE: Record<TeamMemberStatus, StatusTone> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  // Both are empty seats, but they are empty for different reasons, and the
  // roster has to say which: DECLINED is the invitee's decision, REMOVED is the
  // company's.
  DECLINED: 'neutral',
  REMOVED: 'neutral',
};

export const ACCESS_LEVEL_TONE: Record<TeamAccessLevel, StatusTone> = {
  FULL: 'primary',
  MANAGE_JOBS: 'accent',
  PAYMENTS: 'warning',
  VIEW_ONLY: 'neutral',
};

export interface InviteTeamMemberInput {
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  /** At least one. A seat can hold several (BIZ-03). */
  roles: TeamMemberRole[];
  accessLevel: TeamAccessLevel;
}

export interface UpdateTeamMemberInput {
  roles?: TeamMemberRole[];
  accessLevel?: TeamAccessLevel;
  title?: string | null;
}

export function inviteTeamMember(
  businessProfileId: string,
  input: InviteTeamMemberInput,
): Promise<{ id: string }> {
  return restPost<{ id: string }>(`businesses/${businessProfileId}/team`, input);
}

export function updateTeamMember(
  businessProfileId: string,
  memberId: string,
  input: UpdateTeamMemberInput,
): Promise<{ id: string }> {
  return restPatch<{ id: string }>(`businesses/${businessProfileId}/team/${memberId}`, input);
}

export function removeTeamMember(
  businessProfileId: string,
  memberId: string,
): Promise<{ id: string }> {
  return restDelete<{ id: string }>(`businesses/${businessProfileId}/team/${memberId}`);
}

export function acceptTeamInvitation(token: string): Promise<{ businessProfileId: string }> {
  return restPost<{ businessProfileId: string }>('businesses/team/invitations/accept', { token });
}

export function declineTeamInvitation(token: string): Promise<{ ok: boolean }> {
  return restPost<{ ok: boolean }>('businesses/team/invitations/decline', { token });
}

/** Redeems an emailed invitation by setting a password (BIZ-03). No account needed yet. */
export function completeTeamInvitation(input: {
  token: string;
  password: string;
  name?: string;
}): Promise<{ userId: string }> {
  return restPost<{ userId: string }>('businesses/team/invitations/complete', input);
}
