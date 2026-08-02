import { TeamMemberAccessLevel, TeamMemberStatus } from '@kavio/database';

/**
 * What a team member may do for a business (BIZ-03), as a PURE function.
 *
 * BIZ-03 is one line — "access levels (full / manage jobs / payments / view-only)"
 * — and it is precisely the kind of line that gets re-interpreted slightly
 * differently at each call site until one of them lets an accountant post a job.
 * So the whole matrix lives here, as data, with no database in sight: it can be
 * enumerated exhaustively in tests, and every guarded route asks the same
 * question the same way.
 *
 * Three rules beyond the matrix carry the security of this area:
 *
 *   1. ONLY AN ACTIVE, BOUND MEMBER HAS ANY ACCESS. An invitation that has been
 *      sent but not accepted has no `userId` and grants nothing. A removed or
 *      declined row grants nothing. "Was invited" is not "is a member".
 *
 *   2. NOBODY CAN GRANT WHAT THEY DO NOT HOLD. A FULL member may run the team,
 *      but may not mint another FULL member — only the owner does that. Without
 *      this, "full access" is really "ownership", one invitation away.
 *
 *   3. THE OWNER IS UNTOUCHABLE BY THE TEAM. No member, at any level, can change
 *      or remove the owner's access. A team that can lock out its owner is a
 *      business-takeover mechanism.
 */

export type BusinessCapability =
  /** Read the dashboard, analytics, the team list and the company's spend totals. */
  | 'business:view'
  /** Post and manage jobs on behalf of the company (BIZ-02). */
  | 'business:jobs'
  /** See the company's payment records and escrow-derived spend detail (BIZ-03). */
  | 'business:payments'
  /** Invite, re-scope and remove team members (BIZ-03). */
  | 'business:team'
  /** Edit the company profile and submit RCCM verification (BIZ-01). */
  | 'business:profile';

/**
 * The matrix, one row per access level.
 *
 * Every level includes `business:view`: a member who can do something but cannot
 * see the screen it happens on is not a useful grant, and VIEW_ONLY exists
 * precisely to be the floor. Note what MANAGE_JOBS does NOT carry — payments —
 * and what PAYMENTS does not carry — jobs. That separation is the requirement:
 * an HR manager who can hire and an accountant who can see the money are
 * different people in a real company, and the whole point of the level is that
 * neither becomes the other by accident.
 */
export const ACCESS_LEVEL_CAPABILITIES: Readonly<
  Record<TeamMemberAccessLevel, readonly BusinessCapability[]>
> = {
  [TeamMemberAccessLevel.FULL]: [
    'business:view',
    'business:jobs',
    'business:payments',
    'business:team',
    'business:profile',
  ],
  [TeamMemberAccessLevel.MANAGE_JOBS]: ['business:view', 'business:jobs'],
  [TeamMemberAccessLevel.PAYMENTS]: ['business:view', 'business:payments'],
  [TeamMemberAccessLevel.VIEW_ONLY]: ['business:view'],
};

/** Statuses that confer access. Only one does, and that is the point. */
export const ACTIVE_MEMBER_STATUSES: readonly TeamMemberStatus[] = [TeamMemberStatus.ACTIVE];

/**
 * A resolved answer to "who is this caller, to this business?".
 *
 * Built by BusinessAccessService from the database; every authorisation decision
 * in the module is made against this shape rather than against a Prisma row, so
 * the rules stay testable without one.
 */
export interface BusinessAccess {
  readonly businessProfileId: string;
  readonly userId: string;
  /** The owner is not a team row. They hold every capability, permanently. */
  readonly isOwner: boolean;
  /** Null for the owner, who has no access level because they are not scoped. */
  readonly accessLevel: TeamMemberAccessLevel | null;
  /** The BusinessTeamMember row's id, for members. Null for the owner. */
  readonly memberId: string | null;
}

export function accessLevelHas(
  level: TeamMemberAccessLevel,
  capability: BusinessCapability,
): boolean {
  return ACCESS_LEVEL_CAPABILITIES[level].includes(capability);
}

/** Every capability an access resolution confers. The owner holds all of them. */
export function capabilitiesFor(access: BusinessAccess): readonly BusinessCapability[] {
  if (access.isOwner) {
    return ACCESS_LEVEL_CAPABILITIES[TeamMemberAccessLevel.FULL];
  }
  return access.accessLevel ? ACCESS_LEVEL_CAPABILITIES[access.accessLevel] : [];
}

/**
 * The single question every guarded business route asks.
 *
 * `null` access — no ownership, no active membership — is always false. That is
 * the deny-by-default the whole module rests on: a caller the resolver could not
 * place has no business relationship, not a default one.
 */
export function canPerform(access: BusinessAccess | null, capability: BusinessCapability): boolean {
  if (!access) {
    return false;
  }
  return capabilitiesFor(access).includes(capability);
}

/**
 * Whether `access` may hand out `level` (BIZ-03).
 *
 * Only the owner may create another FULL member. A FULL member runs the team but
 * cannot mint a peer — otherwise "full access" is ownership with an extra step,
 * and an invitation is all it takes to make the grant permanent and mutual.
 */
export function canGrantAccessLevel(
  access: BusinessAccess | null,
  level: TeamMemberAccessLevel,
): boolean {
  if (!canPerform(access, 'business:team')) {
    return false;
  }
  if (access!.isOwner) {
    return true;
  }
  return level !== TeamMemberAccessLevel.FULL;
}

export type MemberManagementRefusal =
  | 'NO_TEAM_ACCESS'
  /** Members cannot change or remove the business owner. */
  | 'CANNOT_MANAGE_OWNER'
  /** Nobody re-scopes or removes their own seat. */
  | 'CANNOT_MANAGE_SELF'
  /** A non-owner cannot re-scope a FULL member. */
  | 'CANNOT_MANAGE_PEER';

export interface MemberManagementDecision {
  readonly allowed: boolean;
  readonly reason: MemberManagementRefusal | 'ALLOWED';
}

/** The target of a management action, as facts rather than a Prisma row. */
export interface ManagedMember {
  readonly memberId: string;
  readonly userId: string | null;
  readonly accessLevel: TeamMemberAccessLevel;
  readonly isOwner: boolean;
}

/**
 * Whether `access` may re-scope or remove `target` (BIZ-03).
 *
 * Returns a REASON rather than a boolean so the API can say which rule refused,
 * and so each refusal is testable by name instead of by a shared `false`.
 */
export function canManageMember(
  access: BusinessAccess | null,
  target: ManagedMember,
): MemberManagementDecision {
  if (!canPerform(access, 'business:team')) {
    return { allowed: false, reason: 'NO_TEAM_ACCESS' };
  }

  if (target.isOwner) {
    // Including for the owner themselves: an owner has no team row to edit, and
    // "remove the owner" is a business-deletion decision, not a team one.
    return { allowed: false, reason: 'CANNOT_MANAGE_OWNER' };
  }

  if (target.userId !== null && target.userId === access!.userId) {
    // Self-management is refused rather than harmless: it is how a member with
    // team access promotes themselves, and there is no legitimate use for it —
    // leaving a company is the owner's action to record.
    return { allowed: false, reason: 'CANNOT_MANAGE_SELF' };
  }

  if (!access!.isOwner && target.accessLevel === TeamMemberAccessLevel.FULL) {
    // A FULL member cannot re-scope or remove another FULL member. Two people at
    // the same level racing to remove each other is not a workflow; the owner
    // settles it.
    return { allowed: false, reason: 'CANNOT_MANAGE_PEER' };
  }

  return { allowed: true, reason: 'ALLOWED' };
}

/** How long a team invitation stays valid (BIZ-03). */
export const INVITATION_TTL_HOURS = 14 * 24;

export function invitationExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
}

export function isInvitationExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  // A missing expiry is treated as EXPIRED, not as eternal. An invitation row
  // that lost its deadline is a bug, and the safe reading of a bug in an access
  // grant is "no access".
  return expiresAt === null || expiresAt.getTime() <= now.getTime();
}
