import { Injectable } from '@nestjs/common';
import type { NotificationChannel } from '@trustpro/database';
import type { NotificationChannelProvider } from '../notification.types';
import { EmailProvider } from './email.provider';
import { SmsProvider } from './sms.provider';
import { WebPushProvider } from './web-push.provider';

/**
 * The single place providers are registered against channels. The dispatcher and
 * the delivery processor resolve everything through here and never import a
 * concrete provider, so adding a channel is a one-line change in this file.
 */
@Injectable()
export class NotificationProviderRegistry {
  private readonly providers = new Map<NotificationChannel, NotificationChannelProvider>();

  constructor(email: EmailProvider, webPush: WebPushProvider, sms: SmsProvider) {
    // SMS is registered like any other provider; it simply reports isEnabled()
    // false until the feature flag is flipped.
    for (const provider of [email, webPush, sms]) {
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
