import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AbuseReportStatus,
  ModerationActionType,
  ReportTargetType,
  Role,
  UserStatus,
} from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateReportDto, ModerationActionDto, ReviewReportGroupDto } from './dto/report.dto';
import { ModerationTargetService } from './moderation-target.service';

const logger = createLogger('moderation');

/**
 * Reporting & moderation WRITES (ADM-08).
 *
 * The shape of the workflow, and why:
 *
 *   Anyone signed in can report anything they can see. No capability gates it —
 *   the same reasoning that leaves wallet and safety endpoints ungated: reporting
 *   belongs to the person, and a user who cannot report abuse is a safety hole.
 *
 *   Reports are GROUPED BY TARGET, never handled one by one. Twelve complaints
 *   about one photo are one case; an admin decides once and every report in the
 *   group is closed with that decision's id.
 *
 *   Decisions are ROWS, not column updates. A suspension writes a
 *   ModerationAction (who, why, over what, until when) and only then touches
 *   User.status, so "why is this account suspended?" always has an answer and
 *   REINSTATE is a new row rather than an edit that erases the history.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: ModerationTargetService,
    private readonly events: EventEmitter2,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Reporting (any signed-in user)
  // ───────────────────────────────────────────────────────────────────────────

  async createReport(
    user: AuthenticatedUser,
    dto: CreateReportDto,
  ): Promise<{ id: string; status: AbuseReportStatus }> {
    const target = await this.targets.resolve(dto.targetType, dto.targetId);

    if (!target.exists && !target.ownerId) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'REPORT_TARGET_NOT_FOUND',
        'That item was not found. It may already have been removed.',
      );
    }

    // The accountable party is derived from the target, never taken from the
    // request — see CreateReportDto. The client-supplied id is a fallback only
    // for targets with no single owner (a conversation), and is validated here.
    const reportedUserId = target.ownerId ?? (await this.validateFallbackParty(dto));

    if (reportedUserId === user.id) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CANNOT_REPORT_SELF',
        'You cannot report your own content.',
      );
    }

    // One open report per reporter per item: a second submission updates the
    // first rather than stacking duplicates that inflate the queue's counts.
    const existing = await this.prisma.client.abuseReport.findFirst({
      where: {
        reporterId: user.id,
        targetType: dto.targetType,
        targetId: dto.targetId,
        status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.REVIEWING] },
      },
      select: { id: true, status: true },
    });

    if (existing) {
      await this.prisma.client.abuseReport.update({
        where: { id: existing.id },
        data: { reason: dto.reason, details: dto.details ?? null },
      });
      return existing;
    }

    const report = await this.prisma.client.abuseReport.create({
      data: {
        reporterId: user.id,
        reportedUserId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        details: dto.details ?? null,
        // Messaging targets keep their real relations for the admin thread view.
        ...(dto.targetType === ReportTargetType.MESSAGE ? { messageId: dto.targetId } : {}),
        ...(dto.targetType === ReportTargetType.CONVERSATION
          ? { conversationId: dto.targetId }
          : {}),
      },
      select: { id: true, status: true },
    });

    logger.warn('Content reported', {
      payload: {
        reportId: report.id,
        targetType: dto.targetType,
        reason: dto.reason,
        reportedUserId,
      },
    });

    await this.alertAdmins(dto.targetType, dto.targetId, target.label);

    return report;
  }

  /**
   * Confirms a client-supplied party is genuinely connected to the target before
   * a report is filed against them. Only reached for targets with no owner of
   * their own (a conversation has two members).
   */
  private async validateFallbackParty(dto: CreateReportDto): Promise<string> {
    if (!dto.reportedUserId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'REPORTED_PARTY_REQUIRED',
        'Tell us who this report is about.',
        { reportedUserId: ['Select the person this report concerns.'] },
      );
    }

    if (dto.targetType === ReportTargetType.CONVERSATION) {
      const member = await this.prisma.client.conversationParticipant.findFirst({
        where: { conversationId: dto.targetId, userId: dto.reportedUserId },
        select: { id: true },
      });
      if (!member) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'REPORTED_PARTY_INVALID',
          'That person is not part of this conversation.',
        );
      }
      return dto.reportedUserId;
    }

    const exists = await this.prisma.client.user.findUnique({
      where: { id: dto.reportedUserId },
      select: { id: true },
    });
    if (!exists) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'REPORTED_PARTY_NOT_FOUND',
        'That account was not found.',
      );
    }
    return exists.id;
  }

  /**
   * Puts a new case in front of the people who can act on it (ADM-08).
   *
   * Deliberately only on the FIRST report about an item: a piece of content being
   * mass-reported would otherwise notify every admin once per reporter, which is
   * how an alert channel becomes noise that gets muted.
   */
  private async alertAdmins(
    targetType: ReportTargetType,
    targetId: string,
    label: string | null,
  ): Promise<void> {
    const openCount = await this.prisma.client.abuseReport.count({
      where: {
        targetType,
        targetId,
        status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.REVIEWING] },
      },
    });

    if (openCount > 1) {
      return;
    }

    const grants = await this.prisma.client.userRole.findMany({
      where: { role: Role.ADMIN },
      select: { userId: true },
    });

    const requestId = getRequestId();

    for (const userId of [...new Set(grants.map((g) => g.userId))]) {
      this.events.emit(
        NOTIFICATION_REQUESTED,
        new NotificationRequestedEvent({
          userId,
          templateKey: 'moderation.report_received',
          variables: { targetLabel: label ?? '', targetType },
          metadata: {
            targetType,
            targetId,
            deepLink: `/app/admin/reports/${targetType}/${targetId}`,
          },
          ...(requestId ? { requestId } : {}),
        }),
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Admin review
  // ───────────────────────────────────────────────────────────────────────────

  /** Picks a case up or puts it back, without deciding it. */
  async reviewGroup(
    admin: AuthenticatedUser,
    dto: ReviewReportGroupDto,
  ): Promise<{ updated: number }> {
    const result = await this.prisma.client.abuseReport.updateMany({
      where: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.REVIEWING] },
      },
      data: {
        status: dto.status,
        reviewedById: admin.id,
        reviewNote: dto.reviewNote ?? null,
        reviewedAt: new Date(),
      },
    });

    return { updated: result.count };
  }

  /**
   * Decides a case (ADM-08). Records the decision, applies its effect, closes
   * every open report about the target, and tells the party what happened.
   */
  async act(
    admin: AuthenticatedUser,
    dto: ModerationActionDto,
  ): Promise<{ id: string; reportsClosed: number; contentRemoved: boolean }> {
    const target =
      dto.targetType && dto.targetId
        ? await this.targets.resolve(dto.targetType, dto.targetId)
        : null;

    const subjectUserId = dto.subjectUserId ?? target?.ownerId ?? null;

    if (!subjectUserId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'MODERATION_SUBJECT_UNRESOLVED',
        'That item has no owner on file. Name the account this action applies to.',
        { subjectUserId: ['Select the account this action applies to.'] },
      );
    }

    if (subjectUserId === admin.id) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CANNOT_MODERATE_SELF',
        'You cannot take a moderation action against your own account.',
      );
    }

    if (
      dto.action === ModerationActionType.CONTENT_REMOVED &&
      (!dto.targetType || !this.targets.supportsRemoval(dto.targetType))
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'REMOVAL_UNSUPPORTED',
        'This kind of item cannot be taken down from here. Act on the account instead.',
        { action: ['Choose an action that applies to this item.'] },
      );
    }

    const expiresAt =
      dto.action === ModerationActionType.SUSPEND && dto.suspendDays
        ? new Date(Date.now() + dto.suspendDays * 24 * 60 * 60 * 1000)
        : null;

    // The decision, the account effect and the report closure commit together:
    // a suspension that lands while its reports stay open would put the same case
    // back in the queue tomorrow.
    const { action, reportsClosed } = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.moderationAction.create({
        data: {
          subjectUserId,
          actorId: admin.id,
          action: dto.action,
          targetType: dto.targetType ?? null,
          targetId: dto.targetId ?? null,
          reason: dto.reason,
          internalNote: dto.internalNote ?? null,
          expiresAt,
        },
        select: { id: true, action: true, expiresAt: true },
      });

      if (dto.action === ModerationActionType.SUSPEND || dto.action === ModerationActionType.BAN) {
        await tx.user.update({
          where: { id: subjectUserId },
          data: {
            status: UserStatus.SUSPENDED,
            // Every existing session dies with the suspension; short-lived access
            // tokens age out on their own, which is what keeps them stateless.
            sessionsRevokedAt: new Date(),
          },
        });
      }

      if (dto.action === ModerationActionType.REINSTATE) {
        await tx.user.update({
          where: { id: subjectUserId },
          data: { status: UserStatus.ACTIVE },
        });
      }

      let closed = 0;
      if (dto.targetType && dto.targetId) {
        const result = await tx.abuseReport.updateMany({
          where: {
            targetType: dto.targetType,
            targetId: dto.targetId,
            status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.REVIEWING] },
          },
          data: {
            status:
              dto.action === ModerationActionType.DISMISS
                ? AbuseReportStatus.DISMISSED
                : AbuseReportStatus.ACTIONED,
            moderationActionId: created.id,
            reviewedById: admin.id,
            reviewedAt: new Date(),
          },
        });
        closed = result.count;
      }

      return { action: created, reportsClosed: closed };
    });

    // Takedown runs AFTER the decision commits: it touches other modules' rows
    // (and in the portfolio case its own transaction), and a failure there must
    // not roll back a recorded ruling.
    let contentRemoved = false;
    if (dto.action === ModerationActionType.CONTENT_REMOVED && dto.targetType && dto.targetId) {
      contentRemoved = await this.targets.remove(dto.targetType, dto.targetId);
    }

    logger.warn('Moderation action taken', {
      result: {
        actionId: action.id,
        action: dto.action,
        subjectUserId,
        targetType: dto.targetType ?? null,
        reportsClosed,
        contentRemoved,
      },
    });

    this.notifyParty(subjectUserId, dto, expiresAt);

    return { id: action.id, reportsClosed, contentRemoved };
  }

  /**
   * Tells the party what was decided and why (ADM-08).
   *
   * DISMISS is silent on purpose: nothing happened to them, and "someone reported
   * you but we disagreed" invites retaliation against a reporter they would then
   * go looking for.
   */
  private notifyParty(
    subjectUserId: string,
    dto: ModerationActionDto,
    expiresAt: Date | null,
  ): void {
    if (dto.action === ModerationActionType.DISMISS) {
      return;
    }

    const requestId = getRequestId();

    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: subjectUserId,
        templateKey: 'moderation.action_taken',
        variables: {
          action: dto.action,
          reason: dto.reason,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
        },
        ...(requestId ? { requestId } : {}),
      }),
    );
  }
}
