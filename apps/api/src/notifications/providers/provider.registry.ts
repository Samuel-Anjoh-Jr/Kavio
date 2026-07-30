import { Injectable } from '@nestjs/common';
import type { NotificationChannel } from '@kavio/database';
import type { NotificationChannelProvider } from '../notification.types';
import { EmailProvider } from './email.provider';
import { InAppProvider } from './in-app.provider';
import { SmsProvider } from './sms.provider';
import { WebPushProvider } from './web-push.provider';
import { WhatsappProvider } from './whatsapp.provider';

/**
 * The single place providers are registered against channels. The dispatcher and
 * the delivery processor resolve everything through here and never import a
 * concrete provider, so adding a channel is a one-line change in this file.
 */
@Injectable()
export class NotificationProviderRegistry {
  private readonly providers = new Map<NotificationChannel, NotificationChannelProvider>();

  constructor(
    email: EmailProvider,
    webPush: WebPushProvider,
    sms: SmsProvider,
    inApp: InAppProvider,
    whatsapp: WhatsappProvider,
  ) {
    // SMS and WHATSAPP are registered like any other provider; each simply
    // reports isEnabled() false until its feature flag is flipped. IN_APP is
    // registered the same way — the inbox is a channel, not a special case in
    // the dispatcher.
    for (const provider of [email, webPush, sms, inApp, whatsapp]) {
      this.providers.set(provider.channel, provider);
    }
  }

  get(channel: NotificationChannel): NotificationChannelProvider | undefined {
    return this.providers.get(channel);
  }

  /** Providers that may be used right now (feature flags + config satisfied). */
  getEnabled(): NotificationChannelProvider[] {
    return [...this.providers.values()].filter((provider) => provider.isEnabled());
  }

  isChannelEnabled(channel: NotificationChannel): boolean {
    return this.providers.get(channel)?.isEnabled() ?? false;
  }
}
