import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NOTIFICATION_CHANNEL_PRIORITY, getChannelPriority } from './notification.config';
import { NotificationsController } from './notifications.controller';
import { EmailProvider } from './providers/email.provider';
import { NotificationProviderRegistry } from './providers/provider.registry';
import { SmsProvider } from './providers/sms.provider';
import { WebPushProvider } from './providers/web-push.provider';

/**
 * Notifications module (SRS §17, §26.1, NOT-02).
 *
 * Global so any feature module can inject NotificationPreferenceService without
 * re-importing — though the normal integration path is to EMIT a
 * NotificationRequestedEvent, which needs no injection at all.
 *
 * Providers are constructed from process.env here; each accepts an env object so
 * tests can drive feature flags (e.g. the SMS flip) without mutating globals.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    { provide: EmailProvider, useFactory: () => new EmailProvider(process.env) },
    { provide: WebPushProvider, useFactory: () => new WebPushProvider(process.env) },
    { provide: SmsProvider, useFactory: () => new SmsProvider(process.env) },
    { provide: NOTIFICATION_CHANNEL_PRIORITY, useFactory: () => getChannelPriority(process.env) },
    NotificationProviderRegistry,
    NotificationPreferenceService,
    NotificationDispatcher,
    NotificationDeliveryProcessor,
  ],
  exports: [NotificationDispatcher, NotificationPreferenceService, NotificationProviderRegistry],
})
export class NotificationsModule {}
