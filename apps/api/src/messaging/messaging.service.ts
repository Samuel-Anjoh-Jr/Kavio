import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  MediaAssetKind,
  MessageKind,
  MessageStatus,
  Prisma,
  ReportTargetType,
} from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import type {
  BlockUserDto,
  ReportDto,
  SendMessageDto,
  StartConversationDto,
} from './dto/message.dto';
import { MESSAGE_SENT, MessageSentEvent } from './events/messaging.events';

const logger = createLogger('messaging');

const MESSAGE_MEDIA_KINDS: readonly MediaAssetKind[] = [
  MediaAssetKind.MESSAGE_IMAGE,
  MediaAssetKind.MESSAGE_VOICE,
];

export interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  body: string | null;
  mediaKey: string | null;
  metadata: Prisma.JsonValue | null;
  status: MessageStatus;
  createdAt: Date;
}

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderId: true,
  kind: true,
  body: true,
  mediaKey: true,
  metadata: true,
  status: true,
  createdAt: true,
} as const;

/**
 * Messaging WRITES (REST, per the DUAL API RULE; MSG-01, MSG-02, MSG-04). The
 * inbox and thread reads are GraphQL on MessagingReadService.
 *
 * Every write is scoped to membership: a message can only be sent into a
 * conversation the caller belongs to, and only to someone who has not blocked
 * them (in either direction). The realtime fan-out and the "message received"
 * notification both hang off the MESSAGE_SENT event this emits — the service
 * never talks to a socket or a provider directly.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Opens a conversation with another identity, or resumes the existing one for
   * the same job (MSG-01). Idempotent on (participants, job): a second tap
   * returns the same thread rather than forking a duplicate.
   */
  async startConversation(
    user: AuthenticatedUser,
    dto: StartConversationDto,
  ): Promise<{ id: string }> {
    if (dto.recipientId === user.id) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CANNOT_MESSAGE_SELF',
        'You cannot start a conversation with yourself.',
      );
    }

    const recipient = await this.prisma.client.user.findUnique({
      where: { id: dto.recipientId },
      select: { id: true },
    });
    if (!recipient) {
      throw new AppException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'That person was not found.');
    }

    await this.assertNotBlocked(user.id, dto.recipientId);

    if (dto.jobId) {
      const job = await this.prisma.client.job.findUnique({
        where: { id: dto.jobId },
        select: { id: true },
      });
      if (!job) {
        throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'That job was not found.');
      }
    }

    const existing = await this.findDirectConversation(user.id, dto.recipientId, dto.jobId ?? null);

    const conversationId =
      existing ??
      (
        await this.prisma.client.conversation.create({
          data: {
            jobId: dto.jobId ?? null,
            participants: {
              create: [{ userId: user.id }, { userId: dto.recipientId }],
            },
          },
          select: { id: true },
        })
      ).id;

    if (dto.message) {
      await this.sendMessage(user, conversationId, {
        kind: MessageKind.TEXT,
        body: dto.message,
      });
    }

    logger.info('Conversation started', {
      payload: { conversationId, jobId: dto.jobId ?? null, resumed: Boolean(existing) },
    });
    return { id: conversationId };
  }

  /** Sends a message into a conversation the caller is a member of (MSG-01). */
  async sendMessage(
    user: AuthenticatedUser,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageRow> {
    const participants = await this.requireMembership(conversationId, user.id);
    const others = participants.filter((p) => p.userId !== user.id).map((p) => p.userId);

    // A block in either direction closes the thread (MSG-04).
    for (const otherId of others) {
      await this.assertNotBlocked(user.id, otherId);
    }

    const { metadata, mediaKey } = await this.buildKindPayload(user.id, dto);

    const message = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: user.id,
          kind: dto.kind,
          body: dto.body ?? null,
          mediaKey,
          metadata: metadata ?? Prisma.JsonNull,
          status: MessageStatus.SENT,
        },
        select: MESSAGE_SELECT,
      });

      if (dto.attachmentAssetIds && dto.attachmentAssetIds.length > 0) {
        await tx.messageAttachment.createMany({
          data: dto.attachmentAssetIds.map((mediaAssetId) => ({
            messageId: created.id,
            mediaAssetId,
          })),
        });
      }

      // Denormalise the last-message summary so the inbox list is one indexed read.
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt, lastMessagePreview: previewOf(dto) },
      });

      return created;
    });

    this.events.emit(
      MESSAGE_SENT,
      new MessageSentEvent({
        messageId: message.id,
        conversationId,
        senderId: user.id,
        recipientIds: others,
        kind: message.kind,
        preview: previewOf(dto),
        jobId: await this.conversationJobId(conversationId),
        requestId: getRequestId(),
      }),
    );

    logger.info('Message sent', { payload: { conversationId, kind: message.kind } });
    return message;
  }

  /**
   * Marks a conversation read up to now (MSG-02). Advances the caller's read
   * watermark and flips the counterpart's still-unread messages to READ, which is
   * what the sender's read tick is computed from.
   */
  async markRead(user: AuthenticatedUser, conversationId: string): Promise<{ read: number }> {
    await this.requireMembership(conversationId, user.id);
    const now = new Date();

    const [, updated] = await this.prisma.client.$transaction([
      this.prisma.client.conversationParticipant.updateMany({
        where: { conversationId, userId: user.id },
        data: { lastReadAt: now },
      }),
      this.prisma.client.message.updateMany({
        where: {
          conversationId,
          senderId: { not: user.id },
          status: { not: MessageStatus.READ },
        },
        data: { status: MessageStatus.READ, readAt: now },
      }),
    ]);

    return { read: updated.count };
  }

  /** Marks delivered every not-yet-delivered message to the recipient (MSG-02). */
  async markDelivered(userId: string, conversationId: string): Promise<number> {
    const result = await this.prisma.client.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        status: MessageStatus.SENT,
      },
      data: { status: MessageStatus.DELIVERED, deliveredAt: new Date() },
    });
    return result.count;
  }

  /** Blocks another identity (MSG-04). Idempotent. */
  async blockUser(user: AuthenticatedUser, dto: BlockUserDto): Promise<{ blocked: true }> {
    if (dto.userId === user.id) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CANNOT_BLOCK_SELF',
        'You cannot block yourself.',
      );
    }
    await this.prisma.client.block.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: dto.userId } },
      create: { blockerId: user.id, blockedId: dto.userId, reason: dto.reason ?? null },
      update: { reason: dto.reason ?? null },
    });
    logger.info('User blocked', { payload: { blockedId: dto.userId } });
    return { blocked: true };
  }

  /** Removes a block the caller previously set (MSG-04). Idempotent. */
  async unblockUser(user: AuthenticatedUser, blockedId: string): Promise<{ blocked: false }> {
    await this.prisma.client.block.deleteMany({
      where: { blockerId: user.id, blockedId },
    });
    return { blocked: false };
  }

  /** Reports a conversation/message/user to the moderation queue (MSG-04). */
  async report(user: AuthenticatedUser, dto: ReportDto): Promise<{ id: string }> {
    if (dto.reportedUserId === user.id) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CANNOT_REPORT_SELF',
        'You cannot report yourself.',
      );
    }

    // If a message is cited, it must be one the caller can actually see.
    if (dto.messageId) {
      const message = await this.prisma.client.message.findFirst({
        where: {
          id: dto.messageId,
          conversation: { participants: { some: { userId: user.id } } },
        },
        select: { id: true, conversationId: true },
      });
      if (!message) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'MESSAGE_NOT_FOUND',
          'That message was not found.',
        );
      }
    }

    // The report's grouping key for the moderation workspace (ADM-08). Most
    // specific target wins: a report citing a message is about that message, not
    // the whole thread — which is what lets an admin see every complaint about
    // one message as a single case.
    const { targetType, targetId } = resolveMessagingTarget(dto);

    const report = await this.prisma.client.abuseReport.create({
      data: {
        reporterId: user.id,
        reportedUserId: dto.reportedUserId,
        targetType,
        targetId,
        conversationId: dto.conversationId ?? null,
        messageId: dto.messageId ?? null,
        reason: dto.reason,
        details: dto.details ?? null,
      },
      select: { id: true },
    });

    logger.warn('Abuse report filed', {
      payload: { reportId: report.id, reason: dto.reason, reportedUserId: dto.reportedUserId },
    });
    return report;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  /** The caller must be a member of the conversation; returns all members. */
  private async requireMembership(
    conversationId: string,
    userId: string,
  ): Promise<Array<{ userId: string }>> {
    const conversation = await this.prisma.client.conversation.findFirst({
      where: { id: conversationId, participants: { some: { userId, leftAt: null } } },
      select: { participants: { select: { userId: true } } },
    });
    if (!conversation) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'CONVERSATION_NOT_FOUND',
        'That conversation was not found.',
      );
    }
    return conversation.participants;
  }

  /** Refuses when either party has blocked the other (MSG-04). */
  private async assertNotBlocked(a: string, b: string): Promise<void> {
    const block = await this.prisma.client.block.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { id: true },
    });
    if (block) {
      throw new AppException(HttpStatus.FORBIDDEN, 'BLOCKED', 'You cannot message this person.');
    }
  }

  /** Finds the one direct conversation between two identities for a job (or none). */
  private async findDirectConversation(
    a: string,
    b: string,
    jobId: string | null,
  ): Promise<string | null> {
    const conversation = await this.prisma.client.conversation.findFirst({
      where: {
        jobId,
        AND: [{ participants: { some: { userId: a } } }, { participants: { some: { userId: b } } }],
      },
      select: { id: true },
    });
    return conversation?.id ?? null;
  }

  private async conversationJobId(conversationId: string): Promise<string | null> {
    const conversation = await this.prisma.client.conversation.findUnique({
      where: { id: conversationId },
      select: { jobId: true },
    });
    return conversation?.jobId ?? null;
  }

  /**
   * Validates the kind-specific payload and returns what to persist. LOCATION
   * stores coordinates in metadata; the card kinds store the referenced id;
   * attachments are validated as the caller's own message media.
   */
  private async buildKindPayload(
    userId: string,
    dto: SendMessageDto,
  ): Promise<{ metadata: Prisma.InputJsonValue | null; mediaKey: string | null }> {
    switch (dto.kind) {
      case MessageKind.TEXT:
        if (!dto.body) {
          throw badField('body', 'A text message needs a body.');
        }
        return { metadata: null, mediaKey: null };

      case MessageKind.IMAGE:
      case MessageKind.VOICE: {
        const key = await this.resolveAttachmentKey(userId, dto.attachmentAssetIds);
        return { metadata: null, mediaKey: key };
      }

      case MessageKind.LOCATION:
        if (dto.latitude === undefined || dto.longitude === undefined) {
          throw badField('latitude', 'A location message needs latitude and longitude.');
        }
        return { metadata: { lat: dto.latitude, lng: dto.longitude }, mediaKey: null };

      case MessageKind.QUOTE:
      case MessageKind.JOB:
      case MessageKind.PAYMENT:
        if (!dto.refId) {
          throw badField('refId', 'A card message needs the referenced record id.');
        }
        return { metadata: { refId: dto.refId }, mediaKey: null };

      default:
        return { metadata: null, mediaKey: null };
    }
  }

  /** Resolves the primary attachment's object key, asserting the caller owns it. */
  private async resolveAttachmentKey(
    userId: string,
    ids: string[] | undefined,
  ): Promise<string | null> {
    if (!ids || ids.length === 0) {
      throw badField('attachmentAssetIds', 'An image or voice message needs an attachment.');
    }
    const assets = await this.prisma.client.mediaAsset.findMany({
      where: { id: { in: ids }, ownerId: userId, deletedAt: null },
      select: { id: true, kind: true, s3Key: true },
    });
    if (assets.length !== new Set(ids).size) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'MEDIA_NOT_FOUND',
        'An attachment was not found.',
        {
          attachmentAssetIds: ['Upload the file again.'],
        },
      );
    }
    for (const asset of assets) {
      if (!MESSAGE_MEDIA_KINDS.includes(asset.kind)) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'MEDIA_WRONG_KIND',
          'That file cannot be attached to a message.',
          { attachmentAssetIds: ['Upload it as a message image or voice note.'] },
        );
      }
    }
    return assets[0]?.s3Key ?? null;
  }
}

/** A short, safe inbox/notification preview that never leaks media contents. */
function previewOf(dto: SendMessageDto): string {
  switch (dto.kind) {
    case MessageKind.TEXT:
      return (dto.body ?? '').slice(0, 140);
    case MessageKind.IMAGE:
      return '📷 Photo';
    case MessageKind.VOICE:
      return '🎤 Voice note';
    case MessageKind.LOCATION:
      return '📍 Location';
    case MessageKind.QUOTE:
      return 'Quote';
    case MessageKind.JOB:
      return 'Job';
    case MessageKind.PAYMENT:
      return 'Payment';
    default:
      return 'Message';
  }
}

function badField(field: string, message: string): AppException {
  return new AppException(HttpStatus.BAD_REQUEST, 'INVALID_MESSAGE', message, {
    [field]: [message],
  });
}

/**
 * The (targetType, targetId) grouping key for a messaging report (ADM-08).
 *
 * Messaging reports predate universal reporting and keep their own entry point,
 * so the pair is derived here from whichever id the caller cited rather than
 * being asked for. Most specific target wins.
 */
function resolveMessagingTarget(dto: ReportDto): {
  targetType: ReportTargetType;
  targetId: string;
} {
  if (dto.messageId) {
    return { targetType: ReportTargetType.MESSAGE, targetId: dto.messageId };
  }
  if (dto.conversationId) {
    return { targetType: ReportTargetType.CONVERSATION, targetId: dto.conversationId };
  }
  return { targetType: ReportTargetType.USER, targetId: dto.reportedUserId };
}
