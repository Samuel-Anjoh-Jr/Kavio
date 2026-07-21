import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, TrackingSessionStatus } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import type { PingDto, StartTrackingDto } from './dto/tracking.dto';
import { estimateTravel, type TravelEstimate } from './eta.util';

const logger = createLogger('tracking');

/** Booking states where a worker is plausibly travelling to / doing the job. */
const TRACKABLE_BOOKING_STATES: readonly BookingStatus[] = [
  BookingStatus.PAID,
  BookingStatus.ACCEPTED,
  BookingStatus.IN_PROGRESS,
];

export interface LivePosition {
  sessionId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recordedAt: Date;
  /** Distance + ETA to the destination, or null when the session has none. */
  travel: TravelEstimate | null;
}

/**
 * Live-tracking WRITES + ingestion (PROMPT 74; SOS-03).
 *
 * A worker starts a session for a booking, which IS their explicit consent to
 * share position with the client on it. Position reports arrive over the WS
 * gateway and land here: each is persisted to PostGIS (a replayable route) and
 * turned into a distance/ETA the viewer sees. Consent is revocable — a revoked or
 * ended session refuses further ingestion, so the stream cannot outlive consent.
 */
@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  /** A worker starts (or resumes) sharing their live location for a booking. */
  async startSession(
    worker: AuthenticatedUser,
    dto: StartTrackingDto,
  ): Promise<{ id: string; viewerId: string }> {
    const booking = await this.prisma.client.booking.findUnique({
      where: { id: dto.bookingId },
      select: {
        id: true,
        workerId: true,
        clientId: true,
        status: true,
        job: { select: { latitude: true, longitude: true } },
      },
    });
    if (!booking) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'BOOKING_NOT_FOUND',
        'That booking was not found.',
      );
    }
    if (booking.workerId !== worker.id) {
      // Only the worker being tracked can consent to being tracked.
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'NOT_BOOKING_WORKER',
        'Only the assigned worker can share their location for this booking.',
      );
    }
    if (!TRACKABLE_BOOKING_STATES.includes(booking.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'BOOKING_NOT_TRACKABLE',
        'This booking is not in a state where live tracking applies.',
      );
    }

    const existing = await this.prisma.client.trackingSession.findFirst({
      where: {
        bookingId: booking.id,
        viewerId: booking.clientId,
        status: TrackingSessionStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (existing) {
      return { id: existing.id, viewerId: booking.clientId };
    }

    const session = await this.prisma.client.trackingSession.create({
      data: {
        bookingId: booking.id,
        subjectId: worker.id,
        viewerId: booking.clientId,
        status: TrackingSessionStatus.ACTIVE,
        destinationLat: dto.destinationLat ?? booking.job?.latitude ?? null,
        destinationLng: dto.destinationLng ?? booking.job?.longitude ?? null,
        consentGrantedAt: new Date(),
      },
      select: { id: true },
    });

    logger.info('Tracking session started', {
      payload: { sessionId: session.id, bookingId: booking.id },
    });
    return { id: session.id, viewerId: booking.clientId };
  }

  /**
   * Ingests one position report from the subject (via the WS gateway). Persists it
   * and returns the computed position for the viewer, or null when the session is
   * not one this subject may stream into (revoked, ended, not theirs).
   */
  async ingestPing(
    subjectId: string,
    dto: PingDto,
  ): Promise<{ viewerId: string; position: LivePosition } | null> {
    const session = await this.prisma.client.trackingSession.findFirst({
      where: {
        id: dto.sessionId,
        subjectId,
        status: TrackingSessionStatus.ACTIVE,
        consentRevokedAt: null,
      },
      select: { id: true, viewerId: true, destinationLat: true, destinationLng: true },
    });
    if (!session) {
      return null;
    }

    const ping = await this.prisma.client.locationPing.create({
      data: {
        sessionId: session.id,
        userId: subjectId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy ?? null,
        heading: dto.heading ?? null,
        speed: dto.speed ?? null,
      },
      select: { recordedAt: true },
    });

    const travel = estimateTravel(
      dto.latitude,
      dto.longitude,
      session.destinationLat,
      session.destinationLng,
      dto.speed,
    );

    return {
      viewerId: session.viewerId,
      position: {
        sessionId: session.id,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy ?? null,
        heading: dto.heading ?? null,
        speed: dto.speed ?? null,
        recordedAt: ping.recordedAt,
        travel,
      },
    };
  }

  /** The worker revokes consent — the stream stops immediately (SOS-03). */
  async revokeConsent(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<{ id: string; viewerId: string }> {
    const session = await this.requireSubjectSession(sessionId, user.id);
    await this.prisma.client.trackingSession.update({
      where: { id: session.id },
      data: {
        status: TrackingSessionStatus.ENDED,
        consentRevokedAt: new Date(),
        endedAt: new Date(),
      },
    });
    logger.info('Tracking consent revoked', { payload: { sessionId: session.id } });
    return { id: session.id, viewerId: session.viewerId };
  }

  /** Either party ends the session (arrival, screen closed) — no more fan-out. */
  async endSession(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<{ id: string; viewerId: string; subjectId: string }> {
    const session = await this.prisma.client.trackingSession.findFirst({
      where: {
        id: sessionId,
        status: TrackingSessionStatus.ACTIVE,
        OR: [{ subjectId: user.id }, { viewerId: user.id }],
      },
      select: { id: true, viewerId: true, subjectId: true },
    });
    if (!session) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'SESSION_NOT_FOUND',
        'That session was not found.',
      );
    }
    await this.prisma.client.trackingSession.update({
      where: { id: session.id },
      data: { status: TrackingSessionStatus.ENDED, endedAt: new Date() },
    });
    return session;
  }

  private async requireSubjectSession(sessionId: string, subjectId: string) {
    const session = await this.prisma.client.trackingSession.findFirst({
      where: { id: sessionId, subjectId, status: TrackingSessionStatus.ACTIVE },
      select: { id: true, viewerId: true },
    });
    if (!session) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'SESSION_NOT_FOUND',
        'That session was not found.',
      );
    }
    return session;
  }
}
