import { Injectable } from '@nestjs/common';
import { SOSStatus } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { EmergencyContactView, SOSAlertView } from './models/safety.model';

/**
 * Safety & SOS READS (GraphQL, per the DUAL API RULE; SOS-02, SOS-03). Every
 * query is scoped to the caller's own alerts and contacts in the WHERE.
 */
@Injectable()
export class SafetyReadService {
  constructor(private readonly prisma: PrismaService) {}

  async myContacts(user: AuthenticatedUser): Promise<EmergencyContactView[]> {
    return this.prisma.client.emergencyContact.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        phone: true,
        relationship: true,
        email: true,
        createdAt: true,
      },
    });
  }

  /** The user's SOS history, newest first (SOS-03). */
  async myAlerts(user: AuthenticatedUser): Promise<SOSAlertView[]> {
    const alerts = await this.prisma.client.sOSAlert.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: this.alertSelect(),
    });
    return alerts.map((a) => this.toView(a));
  }

  /** The caller's currently-active alert, if any — drives the "SOS active" banner. */
  async activeAlert(user: AuthenticatedUser): Promise<SOSAlertView | null> {
    const alert = await this.prisma.client.sOSAlert.findFirst({
      where: { userId: user.id, status: SOSStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
      select: this.alertSelect(),
    });
    return alert ? this.toView(alert) : null;
  }

  async alert(user: AuthenticatedUser, id: string): Promise<SOSAlertView | null> {
    const alert = await this.prisma.client.sOSAlert.findFirst({
      where: { id, userId: user.id },
      select: this.alertSelect(),
    });
    return alert ? this.toView(alert) : null;
  }

  private alertSelect() {
    return {
      id: true,
      status: true,
      latitude: true,
      longitude: true,
      message: true,
      jobId: true,
      bookingId: true,
      resolvedAt: true,
      resolutionNote: true,
      createdAt: true,
      shares: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          channel: true,
          delivered: true,
          sentAt: true,
          emergencyContact: { select: { name: true } },
        },
      },
      events: {
        orderBy: { createdAt: 'asc' as const },
        select: { fromStatus: true, toStatus: true, note: true, createdAt: true },
      },
    };
  }

  private toView(alert: {
    id: string;
    status: SOSStatus;
    latitude: number | null;
    longitude: number | null;
    message: string | null;
    jobId: string | null;
    bookingId: string | null;
    resolvedAt: Date | null;
    resolutionNote: string | null;
    createdAt: Date;
    shares: Array<{
      id: string;
      channel: string;
      delivered: boolean;
      sentAt: Date | null;
      emergencyContact: { name: string } | null;
    }>;
    events: Array<{
      fromStatus: SOSStatus | null;
      toStatus: SOSStatus;
      note: string | null;
      createdAt: Date;
    }>;
  }): SOSAlertView {
    return {
      id: alert.id,
      status: alert.status,
      latitude: alert.latitude,
      longitude: alert.longitude,
      message: alert.message,
      jobId: alert.jobId,
      bookingId: alert.bookingId,
      resolvedAt: alert.resolvedAt,
      resolutionNote: alert.resolutionNote,
      createdAt: alert.createdAt,
      shares: alert.shares.map((s) => ({
        id: s.id,
        contactName: s.emergencyContact?.name ?? null,
        channel: s.channel,
        delivered: s.delivered,
        sentAt: s.sentAt,
      })),
      timeline: alert.events,
    };
  }
}
