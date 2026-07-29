import { HttpStatus, Injectable } from '@nestjs/common';
import { MessageStatus, Prisma } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { ConversationThreadView, ConversationView, MessageView } from './models/message.model';

/**
 * Messaging READS (GraphQL, per the DUAL API RULE; MSG-01, MSG-02). Every query
 * is scoped to membership in the WHERE, not just by a capability on the field: a
 * valid token for user A can never read user B's threads by guessing an id.
 */
@Injectable()
export class MessagingReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** The caller's conversation list, most recently active first (MSG-01). */
  async myConversations(user: AuthenticatedUser): Promise<ConversationView[]> {
    const conversations = await this.prisma.client.conversation.findMany({
      where: { participants: { some: { userId: user.id, leftAt: null } } },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        jobId: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        job: { select: { title: true } },
        participants: {
          select: {
            userId: true,
            lastReadAt: true,
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
    });

    const peerIds = conversations
      .map((c) => c.participants.find((p) => p.userId !== user.id)?.userId)
      .filter((id): id is string => Boolean(id));
    const blockedPeers = await this.blockedSet(user.id, peerIds);

    // Unread counts in one grouped query rather than N per-conversation reads.
    const unreadRows = await this.prisma.client.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: conversations.map((c) => c.id) },
        senderId: { not: user.id },
        status: { not: MessageStatus.READ },
      },
      _count: { _all: true },
    });
    const unreadByConversation = new Map(unreadRows.map((r) => [r.conversationId, r._count._all]));

    return conversations.map((c) => {
      const peer = c.participants.find((p) => p.userId !== user.id)?.user ?? null;
      return {
        id: c.id,
        jobId: c.jobId,
        jobTitle: c.job?.title ?? null,
        peer: peer ? { id: peer.id, name: peer.name, avatar: peer.avatar } : null,
        lastMessagePreview: c.lastMessagePreview,
        lastMessageAt: c.lastMessageAt,
        unreadCount: unreadByConversation.get(c.id) ?? 0,
        peerBlocked: peer ? blockedPeers.has(peer.id) : false,
      };
    });
  }

  /** One conversation with a page of messages, scoped to membership (MSG-01). */
  async thread(
    user: AuthenticatedUser,
    conversationId: string,
    limit = 50,
    before?: Date,
  ): Promise<ConversationThreadView> {
    const conversation = await this.prisma.client.conversation.findFirst({
      where: { id: conversationId, participants: { some: { userId: user.id } } },
      select: {
        id: true,
        jobId: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        job: { select: { title: true } },
        participants: {
          select: {
            userId: true,
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
    });
    if (!conversation) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'CONVERSATION_NOT_FOUND',
        'That conversation was not found.',
      );
    }

    const where: Prisma.MessageWhereInput = { conversationId };
    if (before) where.createdAt = { lt: before };

    const rows = await this.prisma.client.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        kind: true,
        body: true,
        status: true,
        mediaKey: true,
        metadata: true,
        deletedAt: true,
        createdAt: true,
        attachments: {
          select: { id: true, mediaAsset: { select: { s3Key: true, visibility: true } } },
        },
      },
    });

    const messages = await Promise.all(rows.reverse().map((m) => this.toMessageView(m)));

    const peer = conversation.participants.find((p) => p.userId !== user.id)?.user ?? null;
    const unreadCount = messages.filter(
      (m) => m.senderId !== user.id && m.status !== MessageStatus.READ,
    ).length;

    return {
      conversation: {
        id: conversation.id,
        jobId: conversation.jobId,
        jobTitle: conversation.job?.title ?? null,
        peer: peer ? { id: peer.id, name: peer.name, avatar: peer.avatar } : null,
        lastMessagePreview: conversation.lastMessagePreview,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount,
        peerBlocked: peer ? (await this.blockedSet(user.id, [peer.id])).has(peer.id) : false,
      },
      messages,
    };
  }

  /** Total unread across every conversation — the app-shell badge (MSG-02). */
  async unreadTotal(user: AuthenticatedUser): Promise<number> {
    return this.prisma.client.message.count({
      where: {
        senderId: { not: user.id },
        status: { not: MessageStatus.READ },
        conversation: { participants: { some: { userId: user.id, leftAt: null } } },
      },
    });
  }

  private async toMessageView(m: {
    id: string;
    conversationId: string;
    senderId: string;
    kind: MessageView['kind'];
    body: string | null;
    status: MessageView['status'];
    mediaKey: string | null;
    metadata: Prisma.JsonValue | null;
    deletedAt: Date | null;
    createdAt: Date;
    attachments: Array<{
      id: string;
      mediaAsset: { s3Key: string; visibility: 'PUBLIC' | 'PRIVATE' };
    }>;
  }): Promise<MessageView> {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const deleted = Boolean(m.deletedAt);

    const attachments = deleted
      ? []
      : await Promise.all(
          m.attachments.map(async (a) => ({
            id: a.id,
            url: await this.storage.urlFor(a.mediaAsset.s3Key, a.mediaAsset.visibility),
          })),
        );

    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      kind: m.kind,
      body: deleted ? null : m.body,
      status: m.status,
      mediaUrl: deleted || !m.mediaKey ? null : await this.storage.urlFor(m.mediaKey, 'PRIVATE'),
      attachments,
      latitude: typeof meta.lat === 'number' ? meta.lat : null,
      longitude: typeof meta.lng === 'number' ? meta.lng : null,
      refId: typeof meta.refId === 'string' ? meta.refId : null,
      deleted,
      createdAt: m.createdAt,
    };
  }

  /** Which of `peerIds` the caller has blocked. */
  private async blockedSet(userId: string, peerIds: string[]): Promise<Set<string>> {
    if (peerIds.length === 0) return new Set();
    const blocks = await this.prisma.client.block.findMany({
      where: { blockerId: userId, blockedId: { in: peerIds } },
      select: { blockedId: true },
    });
    return new Set(blocks.map((b) => b.blockedId));
  }
}
