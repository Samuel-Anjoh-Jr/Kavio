import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { NotificationCategory, NotificationChannel } from '@kavio/database';
import { createLogger } from '../lib/logger';
import { getAppBaseUrl } from '../notifications/notification.config';
import { NotificationProviderRegistry } from '../notifications/providers/provider.registry';
import { renderTemplate } from '../notifications/templates/template.registry';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import {
  BUSINESS_VERIFIED,
  TEAM_INVITATION_SENT,
  BusinessVerifiedEvent,
  TeamInvitationSentEvent,
} from './business.events';

const logger = createLogger('business:notifications');

/**
 * Turns business & team events into notification requests (BIZ-01, BIZ-03).
 *
 * The invitation is the interesting one: the invitee usually has NO Kavio
 * account yet, so there is no userId to hand the per-user
 * NotificationDispatcher — the same structural gap as agent invitations
 * (AgentInvitationNotificationListener). It goes out the same way: rendered
 * from the shared template store and sent directly through the EMAIL
 * provider, rather than left to a channel this identity cannot yet own
 * preferences for.
 *
 * Phone-only invitations (no email on the row) are not delivered here: SMS is
 * a deferred, paid channel (CLAUDE.md), and the row is still redeemable later
 * once that flips — the owner can also just resend to an email address.
 */
@Injectable()
export class TeamNotificationListener {
  constructor(
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly providers: NotificationProviderRegistry,
  ) {}

  @OnEvent(TEAM_INVITATION_SENT)
  async onInvitationSent(event: TeamInvitationSentEvent): Promise<void> {
    if (!event.email) {
      logger.info('Team invitation issued with no email on file, not delivered', {
        result: { memberId: event.memberId, businessProfileId: event.businessProfileId },
      });
      return;
    }

    const email = this.providers.get(NotificationChannel.EMAIL);
    if (!email) return;

    const acceptUrl = `${getAppBaseUrl()}/auth/team-invite?token=${encodeURIComponent(event.token)}`;
    // Derived from the row's actual expiry rather than a second TTL constant,
    // so the copy can never drift from what the token really honours.
    const expiresInDays = Math.max(
      1,
      Math.round((event.expiresAt.getTime() - Date.now()) / 86_400_000),
    );

    // No account exists yet to carry a locale preference; English is the safe
    // default for a link every invitee can still open regardless.
    const message = renderTemplate('business.team_invited', NotificationChannel.EMAIL, 'en', {
      name: event.name,
      businessName: event.businessName,
      acceptUrl,
      expiresInDays,
    });

    if (!message) return;

    await email.send(event.email, message, {
      templateKey: 'business.team_invited',
      category: NotificationCategory.SECURITY,
      // Pre-account delivery: the invitee has no Kavio identity yet.
      userId: null,
      locale: 'en',
    });

    // Logged WITHOUT the token: an invitation token is a bearer credential, and
    // a log line is the last place one should be recoverable from.
    logger.info('Team invitation email sent', {
      result: { memberId: event.memberId, businessProfileId: event.businessProfileId },
    });
  }

  @OnEvent(BUSINESS_VERIFIED)
  async onBusinessVerified(event: BusinessVerifiedEvent): Promise<void> {
    const business = await this.prisma.client.businessProfile.findUnique({
      where: { id: event.businessProfileId },
      select: { name: true },
    });

    // Reuses the verification template: from the owner's point of view this IS a
    // verification approval, and the check type carries the specifics.
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.ownerId,
        templateKey: 'verification.approved',
        variables: {
          checkType: 'BUSINESS_REGISTRATION',
          checkLabelKey: 'Verification.check.BUSINESS_REGISTRATION',
        },
        requestId: event.requestId,
      }),
    );

    logger.info('Business verification announced', {
      result: { businessProfileId: event.businessProfileId, name: business?.name },
    });
  }
}
