import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceRegistrationController } from './device-registration.controller';
import { DeviceRegistrationService } from './device-registration.service';
import { NotificationCenterResolver } from './notification-center.resolver';
import { NotificationCenterService } from './notification-center.service';
import { NotificationDashboardResolver } from './notification-dashboard.resolver';
import { NotificationDashboardService } from './notification-dashboard.service';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationSoundPreferenceService } from './notification-sound-preference.service';
import { NOTIFICATION_CHANNEL_PRIORITY, getChannelPriority } from './notification.config';
import { NotificationsController } from './notifications.controller';
import { EmailProvider } from './providers/email.provider';
import { InAppProvider } from './providers/in-app.provider';
import { NotificationProviderRegistry } from './providers/provider.registry';
import { SmsProvider } from './providers/sms.provider';
import { WebPushProvider } from './providers/web-push.provider';

/**
 * Notifications module (SRS §17, §26.1, NOT-01, NOT-02).
 *
 * Global so any feature module can inject NotificationPreferenceService without
 * re-importing — though the normal integration path is to EMIT a
 * NotificationRequestedEvent, which needs no injection at all.
 *
 * Providers are constructed from process.env here; each accepts an env object so
 * tests can drive feature flags (e.g. the SMS flip) without mutating globals. The
 * WebPushProvider additionally takes PrismaService (P76): web push targets many
 * device subscriptions per identity, so it reads the DeviceRegistration registry
 * to fan out and deactivate dead endpoints. The DeviceRegistration REST surface
 * and the admin delivery dashboard also live here.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController, DeviceRegistrationController],
  providers: [
    { provide: EmailProvider, useFactory: () => new EmailProvider(process.env) },
    {
      provide: WebPushProvider,
      useFactory: (prisma: PrismaService, sounds: NotificationSoundPreferenceService) =>
        new WebPushProvider(prisma, sounds, process.env),
      inject: [PrismaService, NotificationSoundPreferenceService],
    },
    { provide: SmsProvider, useFactory: () => new SmsProvider(process.env) },
    // IN_APP takes no env: the inbox is a database write, so there is no
    // credential to configure and nothing to feature-flag.
    InAppProvider,
    { provide: NOTIFICATION_CHANNEL_PRIORITY, useFactory: () => getChannelPriority(process.env) },
    NotificationProviderRegistry,
    NotificationPreferenceService,
    NotificationSoundPreferenceService,
    NotificationDispatcher,
    NotificationDeliveryProcessor,
    DeviceRegistrationService,
    NotificationDashboardService,
    NotificationDashboardResolver,
    NotificationCenterService,
    NotificationCenterResolver,
  ],
  exports: [
    NotificationDispatcher,
    NotificationPreferenceService,
    NotificationSoundPreferenceService,
    NotificationProviderRegistry,
  ],
})
export class NotificationsModule {}
