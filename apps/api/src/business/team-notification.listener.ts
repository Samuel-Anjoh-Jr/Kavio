import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { createLogger } from '../lib/logger';
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
 * The invitation is the interesting one: the invitee usually has NO TrustPro
 * account yet, so there is no userId to address and no preference row to honour.
 * The dispatcher is built around a user, so this listener addresses the INVITER
 * with the delivery details and lets the business surface send the link — rather
 * than inventing a second, unpreferenced delivery path around the dispatcher,
 * which is exactly what the pattern exists to prevent.
 *
 * A dedicated `business.team_invitation` template for unregistered recipients is
 * a notifications-module change (the registry is keyed on templateKey and owns
 * every piece of user-facing copy), so it is left to that lane rather than
 * hard-coding an English sentence here.
 */
@Injectable()
export class TeamNotificationListener {
  constructor(
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(TEAM_INVITATION_SENT)
  onInvitationSent(event: TeamInvitationSentEvent): void {
    // Logged WITHOUT the token: an invitation token is a bearer credential, and
    // a log line is the last place one should be recoverable from.
    logger.info('Team invitation issued', {
      result: {
        memberId: event.memberId,
        businessProfileId: event.businessProfileId,
        hasEmail: event.email !== null,
      },
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
