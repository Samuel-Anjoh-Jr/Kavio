import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Role, TeamMemberStatus, UserStatus } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { hashPassword } from '../lib/password.util';
import { generateOpaqueToken, hashSecret } from '../lib/secret-hash.util';
import { buildDefaultPreferences } from '../notifications/notification.config';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessAccessService } from './business-access.service';
import {
  canGrantAccessLevel,
  canManageMember,
  invitationExpiresAt,
  isInvitationExpired,
  type BusinessAccess,
  type ManagedMember,
} from './business-access.model';
import type {
  CompleteTeamInvitationDto,
  InviteTeamMemberDto,
  UpdateTeamMemberDto,
} from './dto/team.dto';
import {
  TEAM_INVITATION_SENT,
  TEAM_MEMBER_JOINED,
  TEAM_MEMBER_REMOVED,
  TeamInvitationSentEvent,
  TeamMemberJoinedEvent,
  TeamMemberRemovedEvent,
} from './business.events';

const logger = createLogger('business:team');

/**
 * Every team seat carries the BUSINESS role on its bound identity (granted,
 * not necessarily active) — every business read and write, REST and GraphQL
 * alike, is gated on the caller's ACTIVE role holding a `business:*`
 * permission (see auth/rbac/permissions.ts), which is a property of the
 * platform Role, not of the BusinessTeamMember row. Without this grant an
 * accepted invitation would be an access level nobody's identity can exercise.
 */
async function grantBusinessRole(
  tx: Prisma.TransactionClient,
  userId: string,
  activate: boolean,
): Promise<void> {
  await tx.userRole.upsert({
    where: { userId_role: { userId, role: Role.BUSINESS } },
    create: { userId, role: Role.BUSINESS, isActive: activate },
    update: {},
  });
}

/**
 * Team membership and invitations (BIZ-03).
 *
 * The invitation token is generated once, returned once, and stored only as an
 * HMAC digest — the same discipline as refresh and password-reset tokens, for
 * the same reason: a leaked database must not hand out seats inside other
 * people's companies. It also expires, because an invitation that is valid
 * forever is an unrevoked access grant sitting in an inbox.
 *
 * Every mutation here is authorised twice: once for the capability
 * (`business:team`) and once for the specific target, because "may run the team"
 * and "may re-scope THIS person" are different questions — the second is what
 * stops a full-access member promoting themselves or locking out the owner.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly access: BusinessAccessService,
  ) {}

  /** The team roster (BIZ-03). Any level can see who their colleagues are. */
  async list(user: AuthenticatedUser, businessProfileId: string) {
    await this.access.require(user, businessProfileId, 'business:view');

    const members = await this.prisma.client.businessTeamMember.findMany({
      where: { businessProfileId, status: { not: TeamMemberStatus.REMOVED } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        userId: true,
        name: true,
        email: true,
        phone: true,
        title: true,
        roles: { select: { role: true }, orderBy: { createdAt: 'asc' } },
        accessLevel: true,
        status: true,
        invitationSentAt: true,
        invitationExpiresAt: true,
        acceptedAt: true,
        createdAt: true,
      },
    });

    return members.map((member) => ({
      ...member,
      roles: member.roles.map((entry) => entry.role),
    }));
  }

  /**
   * Invites a colleague onto the team (BIZ-03).
   *
   * Returns the raw token exactly once. The caller (the invitation email) is the
   * only thing that ever sees it; after this method returns, only the digest
   * exists and the token cannot be recovered from the database.
   */
  async invite(user: AuthenticatedUser, businessProfileId: string, dto: InviteTeamMemberDto) {
    const access = await this.access.require(user, businessProfileId, 'business:team');

    if (!canGrantAccessLevel(access, dto.accessLevel)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'CANNOT_GRANT_ACCESS_LEVEL',
        'Only the business owner can grant full access.',
      );
    }

    const token = generateOpaqueToken();
    const now = new Date();
    const expiresAt = invitationExpiresAt(now);
    const requestId = getRequestId();

    let memberId: string;
    let businessName: string;
    try {
      const member = await this.prisma.client.businessTeamMember.create({
        data: {
          businessProfileId,
          name: dto.name,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          title: dto.title ?? null,
          roles: { create: dto.roles.map((role) => ({ role })) },
          accessLevel: dto.accessLevel,
          status: TeamMemberStatus.INVITED,
          invitedById: user.id,
          invitationTokenHash: hashSecret(token),
          invitationSentAt: now,
          invitationExpiresAt: expiresAt,
        },
        select: { id: true, businessProfile: { select: { name: true } } },
      });
      memberId = member.id;
      businessName = member.businessProfile.name;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // The partial unique index: this identity already holds a live seat.
        throw new AppException(
          HttpStatus.CONFLICT,
          'ALREADY_A_MEMBER',
          'That person is already on this team.',
        );
      }
      throw error;
    }

    await this.audit(user.id, 'business.team.invited', memberId, {
      businessProfileId,
      accessLevel: dto.accessLevel,
      roles: dto.roles,
    });

    this.events.emit(
      TEAM_INVITATION_SENT,
      new TeamInvitationSentEvent({
        memberId,
        businessProfileId,
        businessName,
        invitedById: user.id,
        name: dto.name,
        email: dto.email ?? null,
        token,
        expiresAt,
        requestId,
      }),
    );

    logger.info('Team invitation sent', {
      result: { memberId, businessProfileId, accessLevel: dto.accessLevel },
    });

    // The token travels back to the caller once so the invitation can be
    // delivered. It is never readable again.
    return { id: memberId, invitationToken: token };
  }

  /**
   * Accepts an invitation, binding the seat to the accepting identity (BIZ-03).
   *
   * The binding is what turns a contact row into an access grant: until this
   * runs, the row has no `userId` and the access resolver treats it as nothing.
   */
  async acceptInvitation(user: AuthenticatedUser, token: string) {
    const member = await this.prisma.client.businessTeamMember.findUnique({
      where: { invitationTokenHash: hashSecret(token) },
      select: {
        id: true,
        businessProfileId: true,
        status: true,
        accessLevel: true,
        invitationExpiresAt: true,
        userId: true,
      },
    });

    // One message for "no such token", "already used" and "expired": a caller
    // guessing tokens learns nothing from the difference.
    if (!member || member.status !== TeamMemberStatus.INVITED) {
      throw invalidInvitation();
    }

    if (isInvitationExpired(member.invitationExpiresAt)) {
      throw new AppException(
        HttpStatus.GONE,
        'INVITATION_EXPIRED',
        'This invitation has expired — ask for a new one.',
      );
    }

    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.businessTeamMember.update({
          where: { id: member.id },
          data: {
            userId: user.id,
            status: TeamMemberStatus.ACTIVE,
            acceptedAt: new Date(),
            // Burned on use. The row keeps its history; the token stops working.
            invitationTokenHash: null,
          },
        });
        // Granted, not activated: the caller is already signed in under
        // whatever role they opened this with, and switching them into
        // BUSINESS without asking would drop them out of what they were doing.
        await grantBusinessRole(tx, user.id, false);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'ALREADY_A_MEMBER',
          'You are already on this team.',
        );
      }
      throw error;
    }

    await this.audit(user.id, 'business.team.joined', member.id, {
      businessProfileId: member.businessProfileId,
      accessLevel: member.accessLevel,
    });

    this.events.emit(
      TEAM_MEMBER_JOINED,
      new TeamMemberJoinedEvent({
        memberId: member.id,
        businessProfileId: member.businessProfileId,
        userId: user.id,
        requestId: getRequestId(),
      }),
    );

    logger.info('Team invitation accepted', {
      result: { memberId: member.id, businessProfileId: member.businessProfileId },
    });

    return { id: member.id, businessProfileId: member.businessProfileId };
  }

  /** Declines an invitation. Recorded, not deleted — an empty seat has a reason. */
  async declineInvitation(token: string) {
    const member = await this.prisma.client.businessTeamMember.findUnique({
      where: { invitationTokenHash: hashSecret(token) },
      select: { id: true, status: true },
    });

    if (!member || member.status !== TeamMemberStatus.INVITED) {
      throw invalidInvitation();
    }

    await this.prisma.client.businessTeamMember.update({
      where: { id: member.id },
      data: { status: TeamMemberStatus.DECLINED, invitationTokenHash: null },
    });

    return { id: member.id, status: TeamMemberStatus.DECLINED };
  }

  /**
   * Redeems an email invitation for an invitee with no Kavio account yet,
   * setting a password and creating (or binding) their identity in one step
   * (BIZ-03).
   *
   * Public by necessity — the invitee has no account, which is the whole point
   * of the link. The TOKEN is the authorisation. Mirrors
   * AdminUsersService.acceptAgentInvitation: an existing identity (found by the
   * invited email) gains the seat and the BUSINESS role rather than a second
   * account — tier and Trust Score live on the identity — and only a genuinely
   * new identity gets the submitted password.
   */
  async completeInvitation(dto: CompleteTeamInvitationDto): Promise<{ userId: string }> {
    const member = await this.prisma.client.businessTeamMember.findUnique({
      where: { invitationTokenHash: hashSecret(dto.token) },
      select: {
        id: true,
        businessProfileId: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        invitationExpiresAt: true,
      },
    });

    // One message for "no such token", "already used", "expired" and "no email
    // on file": an unauthenticated caller learns nothing from which it was.
    if (
      !member ||
      member.status !== TeamMemberStatus.INVITED ||
      isInvitationExpired(member.invitationExpiresAt) ||
      !member.email
    ) {
      throw invalidInvitation();
    }

    const existing = await this.prisma.client.user.findUnique({
      where: { email: member.email },
      select: { id: true },
    });

    const passwordHash = await hashPassword(dto.password);

    const userId = await this.prisma.client.$transaction(async (tx) => {
      let user: { id: string };
      if (existing) {
        user = await tx.user.findUniqueOrThrow({
          where: { id: existing.id },
          select: { id: true },
        });
      } else {
        try {
          user = await tx.user.create({
            data: {
              name: dto.name ?? member.name,
              email: member.email,
              phone: member.phone,
              passwordHash,
              passwordUpdatedAt: new Date(),
              status: UserStatus.ACTIVE,
              // Clicking a link mailed to this address IS proof of control of it.
              emailVerifiedAt: new Date(),
            },
            select: { id: true },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            // The email lookup above already ruled out an email clash, so a
            // unique violation here can only be the phone the owner typed —
            // already claimed by a DIFFERENT account than the one that email
            // resolved to (or resolved to none).
            throw new AppException(
              HttpStatus.CONFLICT,
              'PHONE_ALREADY_REGISTERED',
              'That phone number already belongs to another Kavio account. Contact support to link this invitation.',
            );
          }
          throw error;
        }
      }

      if (!existing) {
        await tx.notificationPreference.createMany({
          data: buildDefaultPreferences(user.id),
          skipDuplicates: true,
        });
      }

      // New identity: BUSINESS is the only role they have, so it starts active.
      // Existing identity: granted alongside whatever role they already use,
      // left inactive so this does not silently switch them mid-session.
      await grantBusinessRole(tx, user.id, !existing);

      try {
        await tx.businessTeamMember.update({
          where: { id: member.id },
          data: {
            userId: user.id,
            status: TeamMemberStatus.ACTIVE,
            acceptedAt: new Date(),
            invitationTokenHash: null,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new AppException(
            HttpStatus.CONFLICT,
            'ALREADY_A_MEMBER',
            'You are already on this team.',
          );
        }
        throw error;
      }

      return user.id;
    });

    await this.audit(userId, 'business.team.invitation_completed', member.id, {
      businessProfileId: member.businessProfileId,
    });

    this.events.emit(
      TEAM_MEMBER_JOINED,
      new TeamMemberJoinedEvent({
        memberId: member.id,
        businessProfileId: member.businessProfileId,
        userId,
        requestId: getRequestId(),
      }),
    );

    logger.info('Team invitation completed', {
      result: { memberId: member.id, businessProfileId: member.businessProfileId },
    });

    return { userId };
  }

  /** Re-scopes a member's role/access level (BIZ-03). */
  async update(
    user: AuthenticatedUser,
    businessProfileId: string,
    memberId: string,
    dto: UpdateTeamMemberDto,
  ) {
    const access = await this.access.require(user, businessProfileId, 'business:team');
    const target = await this.loadTarget(businessProfileId, memberId);

    this.assertCanManage(access, target);

    if (dto.accessLevel && !canGrantAccessLevel(access, dto.accessLevel)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'CANNOT_GRANT_ACCESS_LEVEL',
        'Only the business owner can grant full access.',
      );
    }

    await this.prisma.client.businessTeamMember.update({
      where: { id: memberId },
      data: {
        // Replaced wholesale rather than diffed: the caller sends the complete
        // set of labels this seat should hold, same as the invite form does.
        ...(dto.roles
          ? { roles: { deleteMany: {}, create: dto.roles.map((role) => ({ role })) } }
          : {}),
        ...(dto.accessLevel ? { accessLevel: dto.accessLevel } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
      },
    });

    await this.audit(user.id, 'business.team.updated', memberId, {
      businessProfileId,
      roles: dto.roles,
      accessLevel: dto.accessLevel,
    });

    logger.info('Team member re-scoped', {
      result: { memberId, businessProfileId, accessLevel: dto.accessLevel, roles: dto.roles },
    });

    return { id: memberId };
  }

  /**
   * Removes a member (BIZ-03).
   *
   * Soft: the row goes to REMOVED with a timestamp rather than being deleted, so
   * "who could approve spending in March" stays answerable — and so the partial
   * unique index lets the same person be re-invited later.
   */
  async remove(user: AuthenticatedUser, businessProfileId: string, memberId: string) {
    const access = await this.access.require(user, businessProfileId, 'business:team');
    const target = await this.loadTarget(businessProfileId, memberId);

    this.assertCanManage(access, target);

    await this.prisma.client.businessTeamMember.update({
      where: { id: memberId },
      data: {
        status: TeamMemberStatus.REMOVED,
        removedAt: new Date(),
        invitationTokenHash: null,
      },
    });

    await this.audit(user.id, 'business.team.removed', memberId, { businessProfileId });

    this.events.emit(
      TEAM_MEMBER_REMOVED,
      new TeamMemberRemovedEvent({
        memberId,
        businessProfileId,
        userId: target.userId,
        removedById: user.id,
        requestId: getRequestId(),
      }),
    );

    logger.info('Team member removed', { result: { memberId, businessProfileId } });

    return { id: memberId, status: TeamMemberStatus.REMOVED };
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private async loadTarget(
    businessProfileId: string,
    memberId: string,
  ): Promise<ManagedMember & { userId: string | null }> {
    const member = await this.prisma.client.businessTeamMember.findFirst({
      // Scoped to the business the caller was authorised for, so a member id
      // from another company cannot be reached through this endpoint.
      where: { id: memberId, businessProfileId },
      select: { id: true, userId: true, accessLevel: true },
    });

    if (!member) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'TEAM_MEMBER_NOT_FOUND',
        'We could not find that team member.',
      );
    }

    return {
      memberId: member.id,
      userId: member.userId,
      accessLevel: member.accessLevel,
      // A team row is never the owner: the owner has no team row at all.
      isOwner: false,
    };
  }

  private assertCanManage(access: BusinessAccess, target: ManagedMember): void {
    const decision = canManageMember(access, target);
    if (decision.allowed) {
      return;
    }

    logger.warn('Team management refused', {
      payload: {
        businessProfileId: access.businessProfileId,
        actorId: access.userId,
        memberId: target.memberId,
        reason: decision.reason,
      },
    });

    throw new AppException(
      HttpStatus.FORBIDDEN,
      decision.reason,
      decision.reason === 'CANNOT_MANAGE_SELF'
        ? 'You cannot change your own access.'
        : 'You cannot manage that team member.',
    );
  }

  private async audit(
    actorId: string,
    action: string,
    memberId: string,
    meta: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        actorId,
        action,
        target: `BusinessTeamMember:${memberId}`,
        requestId: getRequestId(),
        meta,
      },
    });
  }
}

function invalidInvitation(): AppException {
  return new AppException(
    HttpStatus.NOT_FOUND,
    'INVALID_INVITATION',
    'This invitation is no longer valid.',
  );
}
