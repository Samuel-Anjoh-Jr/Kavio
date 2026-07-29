import { TeamMemberAccessLevel } from '@kavio/database';
import {
  ACCESS_LEVEL_CAPABILITIES,
  accessLevelHas,
  canGrantAccessLevel,
  canManageMember,
  canPerform,
  capabilitiesFor,
  invitationExpiresAt,
  isInvitationExpired,
  type BusinessAccess,
  type BusinessCapability,
  type ManagedMember,
} from './business-access.model';

/**
 * The access matrix is what stands between an accountant and the job board, so
 * it is enumerated exhaustively rather than sampled. Every level × every
 * capability is asserted below, which means adding either one to the matrix
 * without deciding this table fails here by name.
 */

const BUSINESS = 'business-1';

const owner: BusinessAccess = {
  businessProfileId: BUSINESS,
  userId: 'owner-1',
  isOwner: true,
  accessLevel: null,
  memberId: null,
};

const member = (
  accessLevel: TeamMemberAccessLevel,
  userId = 'member-1',
  memberId = 'tm-1',
): BusinessAccess => ({
  businessProfileId: BUSINESS,
  userId,
  isOwner: false,
  accessLevel,
  memberId,
});

const target = (
  accessLevel: TeamMemberAccessLevel,
  overrides: Partial<ManagedMember> = {},
): ManagedMember => ({
  memberId: 'tm-2',
  userId: 'member-2',
  accessLevel,
  isOwner: false,
  ...overrides,
});

const ALL_CAPABILITIES: BusinessCapability[] = [
  'business:view',
  'business:jobs',
  'business:payments',
  'business:team',
  'business:profile',
];

describe('business-access.model — the capability matrix (BIZ-03)', () => {
  const expected: Record<TeamMemberAccessLevel, BusinessCapability[]> = {
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

  it.each(Object.values(TeamMemberAccessLevel))('grants exactly the right set at %s', (level) => {
    for (const capability of ALL_CAPABILITIES) {
      expect(accessLevelHas(level, capability)).toBe(expected[level].includes(capability));
    }
  });

  it('separates jobs from payments in both directions', () => {
    // The requirement in one assertion: an HR manager who can hire and an
    // accountant who can see the money must not become each other.
    expect(accessLevelHas(TeamMemberAccessLevel.MANAGE_JOBS, 'business:payments')).toBe(false);
    expect(accessLevelHas(TeamMemberAccessLevel.PAYMENTS, 'business:jobs')).toBe(false);
  });

  it('gives every level the view floor', () => {
    for (const level of Object.values(TeamMemberAccessLevel)) {
      expect(accessLevelHas(level, 'business:view')).toBe(true);
    }
  });

  it('reserves team and profile management to FULL', () => {
    for (const level of Object.values(TeamMemberAccessLevel)) {
      const isFull = level === TeamMemberAccessLevel.FULL;
      expect(accessLevelHas(level, 'business:team')).toBe(isFull);
      expect(accessLevelHas(level, 'business:profile')).toBe(isFull);
    }
  });

  it('covers every declared access level', () => {
    expect(Object.keys(ACCESS_LEVEL_CAPABILITIES).sort()).toEqual(
      Object.values(TeamMemberAccessLevel).sort(),
    );
  });
});

describe('business-access.model — resolution', () => {
  it('gives the owner everything, permanently', () => {
    expect([...capabilitiesFor(owner)].sort()).toEqual([...ALL_CAPABILITIES].sort());
    for (const capability of ALL_CAPABILITIES) {
      expect(canPerform(owner, capability)).toBe(true);
    }
  });

  it('denies a caller with no relationship to the business', () => {
    // Deny by default: a caller the resolver could not place has no business
    // relationship, not a default one.
    for (const capability of ALL_CAPABILITIES) {
      expect(canPerform(null, capability)).toBe(false);
    }
  });

  it('denies a member row that carries no access level', () => {
    const unbound: BusinessAccess = { ...member(TeamMemberAccessLevel.FULL), accessLevel: null };
    expect(capabilitiesFor(unbound)).toEqual([]);
    expect(canPerform(unbound, 'business:view')).toBe(false);
  });
});

describe('business-access.model — privilege escalation (BIZ-03)', () => {
  it('lets the owner grant any level, including FULL', () => {
    for (const level of Object.values(TeamMemberAccessLevel)) {
      expect(canGrantAccessLevel(owner, level)).toBe(true);
    }
  });

  it('stops a FULL member minting another FULL member', () => {
    // Without this, "full access" is ownership with an extra step.
    const full = member(TeamMemberAccessLevel.FULL);
    expect(canGrantAccessLevel(full, TeamMemberAccessLevel.FULL)).toBe(false);
    expect(canGrantAccessLevel(full, TeamMemberAccessLevel.MANAGE_JOBS)).toBe(true);
    expect(canGrantAccessLevel(full, TeamMemberAccessLevel.PAYMENTS)).toBe(true);
    expect(canGrantAccessLevel(full, TeamMemberAccessLevel.VIEW_ONLY)).toBe(true);
  });

  it('stops anyone without team access granting anything at all', () => {
    for (const level of [
      TeamMemberAccessLevel.MANAGE_JOBS,
      TeamMemberAccessLevel.PAYMENTS,
      TeamMemberAccessLevel.VIEW_ONLY,
    ]) {
      for (const grant of Object.values(TeamMemberAccessLevel)) {
        expect(canGrantAccessLevel(member(level), grant)).toBe(false);
      }
    }
    expect(canGrantAccessLevel(null, TeamMemberAccessLevel.VIEW_ONLY)).toBe(false);
  });
});

describe('business-access.model — managing members (BIZ-03)', () => {
  it('lets the owner re-scope any member', () => {
    expect(canManageMember(owner, target(TeamMemberAccessLevel.FULL))).toEqual({
      allowed: true,
      reason: 'ALLOWED',
    });
  });

  it('refuses a member without team access', () => {
    expect(
      canManageMember(
        member(TeamMemberAccessLevel.MANAGE_JOBS),
        target(TeamMemberAccessLevel.VIEW_ONLY),
      ),
    ).toEqual({ allowed: false, reason: 'NO_TEAM_ACCESS' });
  });

  it('protects the owner from the team', () => {
    // A team that can lock out its owner is a business-takeover mechanism.
    const decision = canManageMember(
      member(TeamMemberAccessLevel.FULL),
      target(TeamMemberAccessLevel.FULL, { isOwner: true, userId: 'owner-1' }),
    );
    expect(decision).toEqual({ allowed: false, reason: 'CANNOT_MANAGE_OWNER' });
  });

  it('refuses self-management', () => {
    // The self-promotion path: a FULL member editing their own row.
    const self = member(TeamMemberAccessLevel.FULL, 'member-1', 'tm-1');
    const decision = canManageMember(
      self,
      target(TeamMemberAccessLevel.FULL, { memberId: 'tm-1', userId: 'member-1' }),
    );
    expect(decision).toEqual({ allowed: false, reason: 'CANNOT_MANAGE_SELF' });
  });

  it('stops a FULL member re-scoping a peer', () => {
    const decision = canManageMember(
      member(TeamMemberAccessLevel.FULL),
      target(TeamMemberAccessLevel.FULL),
    );
    expect(decision).toEqual({ allowed: false, reason: 'CANNOT_MANAGE_PEER' });
  });

  it('lets a FULL member manage everyone below them', () => {
    for (const level of [
      TeamMemberAccessLevel.MANAGE_JOBS,
      TeamMemberAccessLevel.PAYMENTS,
      TeamMemberAccessLevel.VIEW_ONLY,
    ]) {
      expect(canManageMember(member(TeamMemberAccessLevel.FULL), target(level)).allowed).toBe(true);
    }
  });

  it('does not confuse an unbound invitation with the acting member', () => {
    // A pending invitation has no userId; that must not accidentally match the
    // actor's own (also absent) binding and trip the self-management rule.
    const decision = canManageMember(
      member(TeamMemberAccessLevel.FULL),
      target(TeamMemberAccessLevel.VIEW_ONLY, { userId: null }),
    );
    expect(decision.allowed).toBe(true);
  });
});

describe('business-access.model — invitations', () => {
  it('expires an invitation after its window', () => {
    const now = new Date('2026-07-21T00:00:00Z');
    const expiry = invitationExpiresAt(now);

    expect(isInvitationExpired(expiry, now)).toBe(false);
    expect(isInvitationExpired(expiry, new Date(expiry.getTime() + 1))).toBe(true);
  });

  it('treats an invitation with no deadline as expired', () => {
    // The safe reading of a bug in an access grant is "no access".
    expect(isInvitationExpired(null)).toBe(true);
  });

  it('treats the exact expiry moment as expired', () => {
    const now = new Date('2026-07-21T00:00:00Z');
    const expiry = invitationExpiresAt(now);
    expect(isInvitationExpired(expiry, expiry)).toBe(true);
  });
});
