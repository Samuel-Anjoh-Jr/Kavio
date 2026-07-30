import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TokenService } from '../auth/token.service';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { authenticateSocket, userRoom } from '../realtime/ws-auth';
import { wsCorsOptions } from '../realtime/ws-cors.config';
import { pingSchema } from './dto/tracking.dto';
import { TrackingService } from './tracking.service';

const logger = createLogger('tracking-gateway');

function sessionRoom(sessionId: string): string {
  return `tracking:${sessionId}`;
}

interface SocketData {
  user: AuthenticatedUser;
}

/**
 * Live-tracking gateway (PROMPT 74; SOS-03; CLAUDE.md SPATIAL foreground streaming).
 *
 * The worker's browser streams positions from the Geolocation API over this
 * socket while the tracking screen is open; each `ping` is persisted to PostGIS
 * and fanned out to the consented client's socket with a fresh distance/ETA.
 * Backed by the Redis adapter, so the subject and viewer need not be on the same
 * API instance. Consent is enforced at ingestion: a revoked or ended session
 * makes ingestPing return null and the gateway tells the sender to stop.
 */
@WebSocketGateway({ namespace: '/tracking', cors: wsCorsOptions() })
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly tracking: TrackingService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const user = authenticateSocket(client, this.tokens);
    if (!user) {
      client.disconnect(true);
      return;
    }
    (client.data as SocketData).user = user;
    await client.join(userRoom(user.id));
    logger.info('Tracking socket connected', { payload: { userId: user.id } });
  }

  handleDisconnect(client: Socket): void {
    const user = (client.data as Partial<SocketData>).user;
    if (user) {
      logger.info('Tracking socket disconnected', { payload: { userId: user.id } });
    }
  }

  /** The client (or the worker) joins a session room to receive positions. */
  @SubscribeMessage('session:watch')
  async onWatch(client: Socket, payload: { sessionId?: string }): Promise<{ ok: boolean }> {
    const user = (client.data as SocketData).user;
    if (!payload?.sessionId) {
      return { ok: false };
    }
    const session = await this.prisma.client.trackingSession.findFirst({
      where: {
        id: payload.sessionId,
        OR: [{ subjectId: user.id }, { viewerId: user.id }],
      },
      select: { id: true },
    });
    if (!session) {
      return { ok: false };
    }
    await client.join(sessionRoom(payload.sessionId));
    return { ok: true };
  }

  /**
   * A position report from the tracked worker. Validated, persisted, and fanned
   * out to the session room + the viewer's room. A ping into a session the caller
   * does not own, or one whose consent was revoked, is silently refused with a
   * `tracking:ended` back to the sender so the browser stops the Geolocation watch.
   */
  @SubscribeMessage('ping')
  async onPing(client: Socket, payload: unknown): Promise<{ ok: boolean }> {
    const user = (client.data as SocketData).user;

    const parsed = pingSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false };
    }

    const result = await this.tracking.ingestPing(user.id, parsed.data);
    if (!result) {
      client.emit('tracking:ended', { sessionId: parsed.data.sessionId });
      return { ok: false };
    }

    // To the session room (anyone watching) and directly to the viewer's room, so
    // a viewer who has not joined the session room yet still gets the update.
    this.server.to(sessionRoom(parsed.data.sessionId)).emit('position', result.position);
    this.server.to(userRoom(result.viewerId)).emit('position', result.position);
    return { ok: true };
  }
}
