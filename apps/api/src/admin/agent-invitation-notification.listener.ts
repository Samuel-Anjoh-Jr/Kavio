import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationCategory, NotificationChannel } from '@kavio/database';
import { createLogger } from '../lib/logger';
import { getAppBaseUrl } from '../notifications/notification.config';
import { NotificationProviderRegistry } from '../notifications/providers/provider.registry';
import { renderTemplate } from '../notifications/templates/template.registry';
import { AGENT_INVITATION_SENT, AgentInvitationSentEvent } from './admin.events';

const logger = createLogger('admin:agent-invitation');

/**
 * Delivers the agent invitation email (ADM-06).
 *
 * The invitee has no Kavio account yet, so there is no userId to hand the
 * per-user NotificationDispatcher — the same structural gap noted on
 * TeamNotificationListener. Unlike a team invite (deferred there pending a
 * template for unregistered recipients), an agent invitation IS security-
 * critical and the only way in (ADM-06 — "agents cannot sign themselves up"),
 * so it goes out here: rendered from the shared template store, sent directly
 * through the EMAIL provider rather than left unsent.
 */
@Injectable()
export class AgentInvitationNotificationListener {
  constructor(private readonly providers: NotificationProviderRegistry) {}

  @OnEvent(AGENT_INVITATION_SENT)
  async onInvitationSent(event: AgentInvitationSentEvent): Promise<void> {
    const email = this.providers.get(NotificationChannel.EMAIL);
    if (!email) return;

    const acceptUrl = `${getAppBaseUrl()}/auth/agent-invite?token=${encodeURIComponent(event.token)}`;
    // Derived from the row's actual expiry rather than a second TTL constant,
    // so the copy can never drift from what the token really honours.
    const expiresInDays = Math.max(
      1,
      Math.round((event.expiresAt.getTime() - Date.now()) / 86_400_000),
    );

    // No account exists yet to carry a locale preference; English is the safe
    // default for a link every invitee can still open regardless.
    const message = renderTemplate('admin.agent_invited', NotificationChannel.EMAIL, 'en', {
      name: event.name,
      acceptUrl,
      expiresInDays,
    });

    if (!message) return;

    await email.send(event.email, message, {
      templateKey: 'admin.agent_invited',
      category: NotificationCategory.SECURITY,
      // Pre-account delivery: the invitee has no Kavio identity yet.
      userId: null,
      locale: 'en',
    });

    // Logged WITHOUT the token, same posture as the team-invitation listener:
    // an invitation token is a bearer credential, never a log line.
    logger.info('Agent invitation email sent', {
      result: { invitationId: event.invitationId, invitedById: event.invitedById },
    });
  }
}
