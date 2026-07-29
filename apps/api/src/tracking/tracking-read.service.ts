import { HttpStatus, Injectable } from '@nestjs/common';
import { TrackingSessionStatus } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { estimateTravel } from './eta.util';
import type { LivePositionView, TrackingSessionView } from './models/tracking.model';

/**
 * Live-tracking READS (GraphQL, per the DUAL API RULE; SOS-03). Scoped to the two
 * parties of a session — the tracked worker and the consented client — in the
 * WHERE, so no one else can read a position by guessing a session id.
 */
@Injectable()
export class TrackingReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** The caller's sessions, as subject or viewer, active first. */
  async mySessions(user: AuthenticatedUser): Promise<TrackingSessionView[]> {
    const sessions = await this.prisma.client.trackingSession.findMany({
      where: { OR: [{ subjectId: user.id }, { viewerId: user.id }] },
      orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
      take: 50,
      select: this.sessionSelect(),
    });
    return sessions.map((s) => this.toView(s));
  }

  /** One session with its last-known position + ETA, scoped to the two parties. */
  async session(user: AuthenticatedUser, id: string): Promise<TrackingSessionView | null> {
    const session = await this.prisma.client.trackingSession.findFirst({
      where: { id, OR: [{ subjectId: user.id }, { viewerId: user.id }] },
      select: this.sessionSelect(),
    });
    return session ? this.toView(session) : null;
  }

  private sessionSelect() {
    return {
      id: true,
      bookingId: true,
      subjectId: true,
      viewerId: true,
      status: true,
      consentRevokedAt: true,
      destinationLat: true,
      destinationLng: true,
      startedAt: true,
      endedAt: true,
      pings: {
        orderBy: { recordedAt: 'desc' as const },
        take: 1,
        select: {
          latitude: true,
          longitude: true,
          accuracy: true,
          heading: true,
          speed: true,
          recordedAt: true,
        },
      },
    };
  }

  private toView(session: {
    id: string;
    bookingId: string;
    subjectId: string;
    viewerId: string;
    status: TrackingSessionStatus;
    consentRevokedAt: Date | null;
    destinationLat: number | null;
    destinationLng: number | null;
    startedAt: Date;
    endedAt: Date | null;
    pings: Array<{
      latitude: number;
      longitude: number;
      accuracy: number | null;
      heading: number | null;
      speed: number | null;
      recordedAt: Date;
    }>;
  }): TrackingSessionView {
    const ping = session.pings[0];
    let latestPosition: LivePositionView | null = null;
    if (ping) {
      const travel = estimateTravel(
        ping.latitude,
        ping.longitude,
        session.destinationLat,
        session.destinationLng,
        ping.speed,
      );
      latestPosition = {
        latitude: ping.latitude,
        longitude: ping.longitude,
        accuracy: ping.accuracy,
        heading: ping.heading,
        speed: ping.speed,
        distanceMeters: travel?.distanceMeters ?? null,
        etaSeconds: travel?.etaSeconds ?? null,
        recordedAt: ping.recordedAt,
      };
    }

    return {
      id: session.id,
      bookingId: session.bookingId,
      subjectId: session.subjectId,
      viewerId: session.viewerId,
      status: session.status,
      consentRevoked: session.consentRevokedAt !== null,
      destinationLat: session.destinationLat,
      destinationLng: session.destinationLng,
      latestPosition,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };
  }

  /** Not currently exposed, but the guard a resolver would use for a raw ping read. */
  async assertParty(user: AuthenticatedUser, sessionId: string): Promise<void> {
    const session = await this.prisma.client.trackingSession.findFirst({
      where: { id: sessionId, OR: [{ subjectId: user.id }, { viewerId: user.id }] },
      select: { id: true },
    });
    if (!session) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'SESSION_NOT_FOUND',
        'That session was not found.',
      );
    }
  }
}
