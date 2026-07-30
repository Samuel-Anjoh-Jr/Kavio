import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { createLogger } from '../lib/logger';
import { MESSAGE_SENT, MessageSentEvent } from '../messaging/events/messaging.events';
import { MessagingService } from '../messaging/messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from './presence.service';
import { authenticateSocket, userRoom } from './ws-auth';
import { wsCorsOptions } from './ws-cors.config';

const logger = createLogger('messaging-gateway');

function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

/** The identity attached to an authenticated socket. */
interface SocketData {
  user: AuthenticatedUser;
}

/**
 * Real-time messaging gateway (PROMPT 71; MSG-01, SRS §13, §16).
 *
 * Backed by the Redis pub/sub adapter (main.ts), so a message emitted on ANY API
 * instance reaches every subscribed socket regardless of which instance the peer
 * connected to. Responsibilities:
 *   • authenticate the handshake (no HTTP guard runs on a socket),
 *   • join the per-identity room (presence) and per-conversation rooms,
 *   • relay typing indicators and read receipts, and
 *   • fan out new messages from the MESSAGE_SENT domain event — the gateway never
 *     writes a message itself; the REST controller does, then this delivers it.
 */
@WebSocketGateway({ namespace: '/messaging', cors: wsCorsOptions() })
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly messaging: MessagingService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const user = authenticateSocket(client, this.tokens);
    if (!user) {
      client.disconnect(true);
      return;
    }

    (client.data as SocketData).user = user;
    await client.join(userRoom(user.id));

    logger.info('Messaging socket connected', { payload: { userId: user.id } });
  }

  handleDisconnect(client: Socket): void {
    const user = (client.data as Partial<SocketData>).user;
    if (user) {
      logger.info('Messaging socket disconnected', { payload: { userId: user.id } });
    }
  }

  /**
   * Joins a conversation room after verifying membership. Returns the peers'
   * online status and marks the caller's incoming messages delivered.
   */
  @SubscribeMessage('conversation:join')
  async onJoin(
    client: Socket,
    payload: { conversationId?: string },
  ): Promise<{ ok: boolean; online?: string[] }> {
    const user = (client.data as SocketData).user;
    const conversationId = payload?.conversationId;
    if (!conversationId) {
      return { ok: false };
    }

    const members = await this.membership(conversationId, user.id);
    if (!members) {
      return { ok: false };
    }

    await client.join(conversationRoom(conversationId));

    // Everything the caller received is now delivered; tell the senders.
    const delivered = await this.messaging.markDelivered(user.id, conversationId);
    if (delivered > 0) {
      this.server
        .to(conversationRoom(conversationId))
        .emit('message:delivered', { conversationId, by: user.id });
    }

    const peers = members.filter((id) => id !== user.id);
    const online = await this.presence.onlineAmong(this.server, peers);
    return { ok: true, online };
  }

  @SubscribeMessage('conversation:leave')
  async onLeave(client: Socket, payload: { conversationId?: string }): Promise<{ ok: boolean }> {
    if (payload?.conversationId) {
      await client.leave(conversationRoom(payload.conversationId));
    }
    return { ok: true };
  }

  /** Relays a typing indicator to the rest of the conversation room. */
  @SubscribeMessage('typing')
  onTyping(client: Socket, payload: { conversationId?: string; typing?: boolean }): void {
    const user = (client.data as SocketData).user;
    if (!payload?.conversationId) {
      return;
    }
    client.to(conversationRoom(payload.conversationId)).emit('typing', {
      conversationId: payload.conversationId,
      userId: user.id,
      typing: payload.typing !== false,
    });
  }

  /** The caller has read the thread — persist and broadcast the read receipt. */
  @SubscribeMessage('conversation:read')
  async onRead(
    client: Socket,
    payload: { conversationId?: string },
  ): Promise<{ ok: boolean; read?: number }> {
    const user = (client.data as SocketData).user;
    if (!payload?.conversationId) {
      return { ok: false };
    }
    const members = await this.membership(payload.conversationId, user.id);
    if (!members) {
      return { ok: false };
    }
    const { read } = await this.messaging.markRead(user, payload.conversationId);
    this.server
      .to(conversationRoom(payload.conversationId))
      .emit('message:read', { conversationId: payload.conversationId, by: user.id });
    return { ok: true, read };
  }

  /** Point-in-time presence query for a single peer. */
  @SubscribeMessage('presence:query')
  async onPresence(
    _client: Socket,
    payload: { userId?: string },
  ): Promise<{ userId: string; online: boolean } | { ok: false }> {
    if (!payload?.userId) {
      return { ok: false };
    }
    return {
      userId: payload.userId,
      online: await this.presence.isOnline(this.server, payload.userId),
    };
  }

  /**
   * Fan-out for a newly sent message (from the REST write path). Delivers the row
   * to the conversation room and bumps each recipient's inbox, so a peer who has
   * the thread open sees the bubble immediately and one who does not still sees
   * their unread badge move.
   */
  @OnEvent(MESSAGE_SENT)
  async onMessageSent(event: MessageSentEvent): Promise<void> {
    const message = await this.prisma.client.message.findUnique({
      where: { id: event.messageId },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        kind: true,
        body: true,
        metadata: true,
        status: true,
        createdAt: true,
      },
    });
    if (!message) {
      return;
    }

    this.server.to(conversationRoom(event.conversationId)).emit('message:new', message);

    for (const recipientId of event.recipientIds) {
      this.server.to(userRoom(recipientId)).emit('conversation:updated', {
        conversationId: event.conversationId,
        preview: event.preview,
        senderId: event.senderId,
        at: message.createdAt,
      });
    }
  }

  /** The conversation's members, or null when the caller is not one. */
  private async membership(conversationId: string, userId: string): Promise<string[] | null> {
    const conversation = await this.prisma.client.conversation.findFirst({
      where: { id: conversationId, participants: { some: { userId } } },
      select: { participants: { select: { userId: true } } },
    });
    return conversation ? conversation.participants.map((p) => p.userId) : null;
  }
}
