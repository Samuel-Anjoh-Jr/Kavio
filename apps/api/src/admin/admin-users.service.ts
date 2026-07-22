import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AbuseReportStatus,
  AgentInvitationStatus,
  Prisma,
  Role,
  UserStatus,
} from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { hashPassword } from '../lib/password.util';
import { generateOpaqueToken, hashSecret } from '../lib/secret-hash.util';
import { PrismaService } from '../prisma/prisma.service';
import { AGENT_INVITATION_SENT, AgentInvitationSentEvent } from './admin.events';
import type { AcceptAgentInvitationDto, InviteAgentDto, ListUsersDto } from './dto/admin.dto';
import type {
  AdminUserPageView,
  AdminUserView,
  AgentInvitationView,
} from './models/admin-users.model';

const logger = createLogger('admin:users');

/** Page ceiling. An admin directory is for finding people, not for exporting them. */
const MAX_PAGE = 50;

/** How long an agent invitation stays redeemable. */
const INVITATION_TTL_DAYS = 14;

/**
 * Account management and agent invitations (ADM-02, ADM-06).
 *
 * ── What this service does NOT do ───────────────────────────────────────────
 *
 * It does not suspend, ban or reinstate anybody. Those are moderation actions
 * and they already exist (ADM-08): one append-only ModerationAction carrying the
 * actor, the reason shown to the party, and an expiry, which also notifies the
 * person affected. Adding a "suspend" here would be a SECOND, quieter route to
 * the same outcome — one with no reason attached and no notification — and the
 * existence of that route is exactly what an audit trail is supposed to prevent.
 * The admin console calls the moderation endpoint for those.
 *
 * What it does own is the one account operation with no moderation equivalent:
 * bringing a field AGENT into existence. Agents cannot self-register, because a
 * field agent physically verifies workers — the most abusable capability the
 * platform grants — so the only route in is an admin issuing an invitation.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** The admin directory: search, filter, page (ADM-02). */
  async listUsers(dto: ListUsersDto): Promise<AdminUserPageView> {
    const started = Date.now();
    const take = Math.min(dto.limit ?? 20, MAX_PAGE);
    const skip = dto.offset ?? 0;

    const where: Prisma.UserWhereInput = {
      // DELETED accounts are excluded rather than shown greyed out: the row is a
      // tombstone, and listing it invites an admin to act on an identity that has
      // already exercised its right to be gone.
      status: dto.status ?? { not: UserStatus.DELETED },
      ...(dto.role ? { roles: { some: { role: dto.role } } } : {}),
      ...(dto.tier ? { tier: dto.tier } : {}),
      ...(dto.query
        ? {
            // Contains-insensitive across the three identifiers an admin actually
            // has to hand. Email and phone are unique-indexed; name is not, so
            // this is bounded by the page size above rather than by an index.
            OR: [
              { name: { contains: dto.query, mode: 'insensitive' } },
              { email: { contains: dto.query, mode: 'insensitive' } },
              { phone: { contains: dto.query } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatar: true,
          status: true,
          tier: true,
          trustScore: true,
          createdAt: true,
          roles: { select: { role: true, isActive: true } },
          trustScoreRecord: { select: { completedJobs: true, averageRating: true } },
          // Counted, not loaded: an admin list needs "how many", and pulling the
          // rows themselves would be a fan-out per user across the whole page.
          _count: {
            select: {
              moderationAgainst: true,
              reportsAbout: {
                where: {
                  status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.REVIEWING] },
                },
              },
            },
          },
        },
      }),
      this.prisma.client.user.count({ where }),
    ]);

    const durationMs = Date.now() - started;
    if (durationMs > 300) {
      logger.warn('Admin user search exceeded the slow-query budget', {
        result: { total, take },
        durationMs,
      });
    }

    return {
      items: rows.map((row): AdminUserView => {
        const active = row.roles.find((entry) => entry.isActive);
        return {
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          avatar: row.avatar,
          status: row.status,
          tier: row.tier,
          trustScore: row.trustScore,
          roles: row.roles.map((entry) => entry.role),
          activeRole: active?.role ?? null,
          completedJobs: row.trustScoreRecord?.completedJobs ?? 0,
          averageRating:
            row.trustScoreRecord?.averageRating === null ||
            row.trustScoreRecord?.averageRating === undefined
              ? null
              : Number(row.trustScoreRecord.averageRating),
          moderationActionCount: row._count.moderationAgainst,
          openReportCount: row._count.reportsAbout,
          createdAt: row.createdAt,
        };
      }),
      total,
      hasMore: skip + rows.length < total,
    };
  }

  /** Outstanding and historic agent invitations (ADM-06). */
  async listAgentInvitations(status?: AgentInvitationStatus): Promise<AgentInvitationView[]> {
    const rows = await this.prisma.client.agentInvitation.findMany({
      where: status ? { status } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: MAX_PAGE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        note: true,
        expiresAt: true,
        acceptedAt: true,
        acceptedUserId: true,
        createdAt: true,
        invitedBy: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      // Expiry is reported from the CLOCK, not from a sweep: an invitation whose
      // date has passed is expired whether or not a job has got round to marking
      // it, and showing it as PENDING would have an admin chasing a dead link.
      status:
        row.status === AgentInvitationStatus.PENDING && row.expiresAt < new Date()
          ? AgentInvitationStatus.EXPIRED
          : row.status,
      invitedByName: row.invitedBy.name,
      acceptedUserId: row.acceptedUserId,
      note: row.note,
      expiresAt: row.expiresAt,
      acceptedAt: row.acceptedAt,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Invites someone to join as a field agent (ADM-06).
   *
   * The token is generated here, HASHED into the row, and handed to the
   * dispatcher on the event — the same shape as team invitations and refresh
   * tokens. A leaked invitations table must not hand out agent accounts, and an
   * agent account is a verification credential.
   */
  async inviteAgent(admin: AuthenticatedUser, dto: InviteAgentDto): Promise<AgentInvitationView> {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.client.user.findUnique({
      where: { email },
      select: { id: true, roles: { select: { role: true } } },
    });

    if (existingUser?.roles.some((entry) => entry.role === Role.AGENT)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ALREADY_AN_AGENT',
        'That person already has an agent account.',
        { email: ['This address already belongs to an agent.'] },
      );
    }

    const outstanding = await this.prisma.client.agentInvitation.findFirst({
      where: {
        email,
        status: AgentInvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (outstanding) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVITATION_ALREADY_OPEN',
        'There is already an open invitation for that address.',
        { email: ['An invitation is already waiting for this address.'] },
      );
    }

    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);

    const created = await this.prisma.client.agentInvitation.create({
      data: {
        name: dto.name,
        email,
        phone: dto.phone ?? null,
        note: dto.note ?? null,
        tokenHash: hashSecret(token),
        expiresAt,
        invitedById: admin.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        note: true,
        expiresAt: true,
        acceptedAt: true,
        acceptedUserId: true,
        createdAt: true,
        invitedBy: { select: { name: true } },
      },
    });

    await this.audit(admin, 'admin.agent_invitation.created', created.id, { email });

    // EMIT, never call a provider (SRS §17). The dispatcher decides the channel
    // and writes the NotificationLog.
    this.events.emit(
      AGENT_INVITATION_SENT,
      new AgentInvitationSentEvent({
        invitationId: created.id,
        invitedById: admin.id,
        name: created.name,
        email: created.email,
        token,
        expiresAt,
        requestId: getRequestId(),
      }),
    );

    return {
      ...created,
      invitedByName: created.invitedBy.name,
    };
  }

  /** Withdraws an outstanding invitation (ADM-06). */
  async revokeAgentInvitation(admin: AuthenticatedUser, id: string): Promise<{ id: string }> {
    const invitation = await this.prisma.client.agentInvitation.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!invitation) {
      throw new AppException(HttpStatus.NOT_FOUND, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    }

    if (invitation.status !== AgentInvitationStatus.PENDING) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVITATION_NOT_PENDING',
        'Only an outstanding invitation can be withdrawn.',
      );
    }

    await this.prisma.client.agentInvitation.update({
      where: { id },
      data: { status: AgentInvitationStatus.REVOKED, revokedAt: new Date() },
    });

    await this.audit(admin, 'admin.agent_invitation.revoked', id, {});

    return { id };
  }

  /**
   * Redeems an invitation and creates the agent identity (ADM-06).
   *
   * Public by necessity — the invitee has no account yet, which is the whole
   * point. The token IS the authorisation, so it is looked up by digest and the
   * whole thing commits in one transaction: an identity created without its
   * invitation being consumed would be an agent account whose link still works.
   */
  async acceptAgentInvitation(dto: AcceptAgentInvitationDto): Promise<{ userId: string }> {
    const tokenHash = hashSecret(dto.token);

    const invitation = await this.prisma.client.agentInvitation.findUnique({
      where: { tokenHash },
      select: { id: true, name: true, email: true, phone: true, status: true, expiresAt: true },
    });

    // One message for "no such token", "already used" and "expired": telling an
    // unauthenticated caller which of the three it was turns this endpoint into
    // an oracle for probing invitation tokens.
    if (
      !invitation ||
      invitation.status !== AgentInvitationStatus.PENDING ||
      invitation.expiresAt < new Date()
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVITATION_INVALID',
        'That invitation link is no longer valid. Ask an administrator for a new one.',
      );
    }

    const existing = await this.prisma.client.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });

    const passwordHash = await hashPassword(dto.password);

    const userId = await this.prisma.client.$transaction(async (tx) => {
      const user = existing
        ? // An existing identity gains the AGENT role rather than a second
          // account: tier and Trust Score attach to the identity (ACC-06), and
          // splitting somebody in two would make them re-verify.
          await tx.user.update({
            where: { id: existing.id },
            data: {
              roles: {
                upsert: {
                  where: { userId_role: { userId: existing.id, role: Role.AGENT } },
                  create: { role: Role.AGENT, isActive: false },
                  update: {},
                },
              },
            },
            select: { id: true },
          })
        : await tx.user.create({
            data: {
              name: dto.name ?? invitation.name,
              email: invitation.email,
              phone: invitation.phone,
              passwordHash,
              status: UserStatus.ACTIVE,
              emailVerifiedAt: new Date(),
              roles: { create: { role: Role.AGENT, isActive: true } },
            },
            select: { id: true },
          });

      await tx.agentInvitation.update({
        where: { id: invitation.id },
        data: {
          status: AgentInvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedUserId: user.id,
        },
      });

      return user.id;
    });

    logger.info('Agent invitation accepted', { result: { invitationId: invitation.id, userId } });

    return { userId };
  }

  /**
   * Every admin account action is audit-logged. The guard decides who gets in;
   * the audit log answers for what they did once they were in (SRS §24).
   */
  private async audit(
    actor: AuthenticatedUser,
    action: string,
    targetId: string | null,
    meta: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        actorId: actor.id,
        action,
        target: targetId ? `AgentInvitation:${targetId}` : 'AgentInvitation',
        requestId: getRequestId(),
        meta,
      },
    });
  }
}
