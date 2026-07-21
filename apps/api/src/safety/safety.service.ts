import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SOSStatus } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { normalizeToE164 } from '../lib/phone.util';
import { createLogger, getRequestId } from '../lib/logger';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateEmergencyContactDto,
  ResolveSosDto,
  TriggerSosDto,
  UpdateEmergencyContactDto,
  UpdateSosLocationDto,
} from './dto/sos.dto';
import {
  SOS_RESOLVED,
  SOS_TRIGGERED,
  SosResolvedEvent,
  SosTriggeredEvent,
} from './events/safety.events';

const logger = createLogger('safety');

/**
 * Safety & SOS WRITES (REST, per the DUAL API RULE; SOS-01, SOS-02, SOS-03).
 *
 * Triggering an SOS is an auditable safety event: it captures the person's
 * position, records a share row per emergency contact (proving who was told and
 * how), and fans the alert out through the NotificationDispatcher — email/console
 * at launch, SMS the moment the flag flips, with no change here. Resolution and
 * every status move append an SOSAlertEvent, the tamper-evident safety trail.
 */
@Injectable()
export class SafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** Raises an SOS and shares the live location with the user's contacts (SOS-01). */
  async triggerSos(user: AuthenticatedUser, dto: TriggerSosDto): Promise<{ id: string }> {
    const requestId = getRequestId();

    const contacts = await this.prisma.client.emergencyContact.findMany({
      where: { userId: user.id, isActive: true },
      select: { id: true, name: true, email: true },
    });

    const alert = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.sOSAlert.create({
        data: {
          userId: user.id,
          status: SOSStatus.ACTIVE,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          accuracy: dto.accuracy ?? null,
          message: dto.message ?? null,
          jobId: dto.jobId ?? null,
          bookingId: dto.bookingId ?? null,
        },
        select: { id: true },
      });

      await tx.sOSAlertEvent.create({
        data: {
          sosAlertId: created.id,
          fromStatus: null,
          toStatus: SOSStatus.ACTIVE,
          actorId: user.id,
          note: 'SOS triggered',
          requestId,
        },
      });

      // One share row per contact + one for the internal safety process. Written
      // even for a contact we can only reach by (deferred) SMS, so the audit shows
      // the intent to notify, not only the sends that happened to succeed today.
      await tx.sOSAlertShare.createMany({
        data: [
          ...contacts.map((c) => ({
            sosAlertId: created.id,
            emergencyContactId: c.id,
            channel: c.email ? 'email' : 'sms',
            delivered: false,
            sentAt: new Date(),
          })),
          {
            sosAlertId: created.id,
            emergencyContactId: null,
            channel: 'safety_process',
            delivered: false,
            sentAt: new Date(),
          },
        ],
      });

      return created;
    });

    // Fan out to every contact with a reachable channel. Contacts have no account,
    // so the notification is addressed directly (userId:null, to:{email}).
    const triggerer = await this.userName(user.id);
    const mapUrl = mapLink(dto.latitude, dto.longitude);
    for (const contact of contacts) {
      if (!contact.email) {
        continue; // SMS is deferred; the share row above already records the intent.
      }
      this.events.emit(
        NOTIFICATION_REQUESTED,
        new NotificationRequestedEvent({
          userId: null,
          to: { email: contact.email },
          templateKey: 'safety.sos_triggered',
          variables: {
            userName: triggerer,
            contactName: contact.name,
            message: dto.message ?? null,
            mapUrl,
          },
          metadata: { alertId: alert.id, sosContactId: contact.id },
          requestId,
        }),
      );
    }

    // Notify the internal safety inbox when one is configured.
    const safetyEmail = process.env.SAFETY_ALERT_EMAIL;
    if (safetyEmail) {
      this.events.emit(
        NOTIFICATION_REQUESTED,
        new NotificationRequestedEvent({
          userId: null,
          to: { email: safetyEmail },
          templateKey: 'safety.sos_triggered',
          variables: {
            userName: triggerer,
            contactName: 'Safety team',
            message: dto.message ?? null,
            mapUrl,
          },
          metadata: { alertId: alert.id, safetyProcess: true },
          requestId,
        }),
      );
    }

    this.events.emit(
      SOS_TRIGGERED,
      new SosTriggeredEvent({
        alertId: alert.id,
        userId: user.id,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        message: dto.message ?? null,
        contactCount: contacts.length,
        requestId,
      }),
    );

    logger.warn('SOS triggered', {
      payload: { alertId: alert.id, userId: user.id, contactCount: contacts.length },
    });
    return alert;
  }

  /** Updates an active alert's live position so responders track the person (SOS-03). */
  async updateLocation(
    user: AuthenticatedUser,
    alertId: string,
    dto: UpdateSosLocationDto,
  ): Promise<{ id: string }> {
    const alert = await this.requireOwnActiveAlert(alertId, user.id);
    await this.prisma.client.sOSAlert.update({
      where: { id: alert.id },
      data: { latitude: dto.latitude, longitude: dto.longitude, accuracy: dto.accuracy ?? null },
    });
    return { id: alert.id };
  }

  /** Resolves an alert as genuine-resolved or a false alarm (SOS-03). */
  async resolve(
    user: AuthenticatedUser,
    alertId: string,
    dto: ResolveSosDto,
  ): Promise<{ id: string }> {
    const alert = await this.requireOwnActiveAlert(alertId, user.id);
    const requestId = getRequestId();

    await this.prisma.client.$transaction([
      this.prisma.client.sOSAlert.update({
        where: { id: alert.id },
        data: {
          status: dto.status,
          resolvedById: user.id,
          resolvedAt: new Date(),
          resolutionNote: dto.note ?? null,
        },
      }),
      this.prisma.client.sOSAlertEvent.create({
        data: {
          sosAlertId: alert.id,
          fromStatus: SOSStatus.ACTIVE,
          toStatus: dto.status,
          actorId: user.id,
          note: dto.note ?? null,
          requestId,
        },
      }),
    ]);

    this.events.emit(
      SOS_RESOLVED,
      new SosResolvedEvent({ alertId: alert.id, userId: user.id, requestId }),
    );
    logger.info('SOS resolved', { payload: { alertId: alert.id, status: dto.status } });
    return { id: alert.id };
  }

  // ── Emergency contacts (SOS-02) ─────────────────────────────────────────────

  async addContact(
    user: AuthenticatedUser,
    dto: CreateEmergencyContactDto,
  ): Promise<{ id: string }> {
    const phone = this.requirePhone(dto.phone);
    const contact = await this.prisma.client.emergencyContact.create({
      data: {
        userId: user.id,
        name: dto.name,
        phone,
        relationship: dto.relationship ?? null,
        email: dto.email ?? null,
      },
      select: { id: true },
    });
    return contact;
  }

  async updateContact(
    user: AuthenticatedUser,
    contactId: string,
    dto: UpdateEmergencyContactDto,
  ): Promise<{ id: string }> {
    await this.requireOwnContact(contactId, user.id);
    const phone = dto.phone !== undefined ? this.requirePhone(dto.phone) : undefined;
    await this.prisma.client.emergencyContact.update({
      where: { id: contactId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(dto.relationship !== undefined ? { relationship: dto.relationship ?? null } : {}),
        ...(dto.email !== undefined ? { email: dto.email ?? null } : {}),
      },
    });
    return { id: contactId };
  }

  /** Soft-disables a contact so past share records keep resolving to it (SOS-02). */
  async removeContact(user: AuthenticatedUser, contactId: string): Promise<{ id: string }> {
    await this.requireOwnContact(contactId, user.id);
    await this.prisma.client.emergencyContact.update({
      where: { id: contactId },
      data: { isActive: false },
    });
    return { id: contactId };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async requireOwnActiveAlert(alertId: string, userId: string) {
    const alert = await this.prisma.client.sOSAlert.findFirst({
      where: { id: alertId, userId },
      select: { id: true, status: true },
    });
    if (!alert) {
      throw new AppException(HttpStatus.NOT_FOUND, 'SOS_NOT_FOUND', 'That alert was not found.');
    }
    if (alert.status !== SOSStatus.ACTIVE) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'SOS_NOT_ACTIVE',
        'That alert has already been resolved.',
      );
    }
    return alert;
  }

  private async requireOwnContact(contactId: string, userId: string) {
    const contact = await this.prisma.client.emergencyContact.findFirst({
      where: { id: contactId, userId, isActive: true },
      select: { id: true },
    });
    if (!contact) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'CONTACT_NOT_FOUND',
        'That emergency contact was not found.',
      );
    }
    return contact;
  }

  private requirePhone(raw: string): string {
    const phone = normalizeToE164(raw);
    if (!phone) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_PHONE',
        'That phone number is not valid.',
        { phone: ['Enter a valid Cameroon phone number.'] },
      );
    }
    return phone;
  }

  private async userName(userId: string): Promise<string> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name?.trim() || 'A TrustPro user';
  }
}

/** A shareable map link for the captured position; empty string when no fix. */
function mapLink(lat?: number, lng?: number): string {
  if (lat === undefined || lng === undefined) {
    return '';
  }
  return `https://maps.google.com/?q=${lat},${lng}`;
}
