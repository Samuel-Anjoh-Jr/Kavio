import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type { Redis } from 'ioredis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GqlThrottlerGuard } from './lib/gql-throttler.guard';
import { RequestIdMiddleware } from './lib/request-id.middleware';
import { RequestLoggerMiddleware } from './lib/request-logger.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { RedisModule } from './redis/redis.module';
import { REDIS_CLIENT } from './redis/redis.constants';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { GraphQLModule } from './graphql/graphql.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';
import { TrustModule } from './trust/trust.module';
import { StorageModule } from './storage/storage.module';
import { DocumentsModule } from './documents/documents.module';
import { VerificationModule } from './verification/verification.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { GeoModule } from './geo/geo.module';
import { CatalogModule } from './catalog/catalog.module';
import { SearchModule } from './search/search.module';
import { ProfilesModule } from './profiles/profiles.module';
import { FavoritesModule } from './profiles/favorites/favorites.module';
import { JobsModule } from './jobs/jobs.module';
import { QuotesModule } from './quotes/quotes.module';
import { PaymentsModule } from './payments/payments.module';
import { MessagingModule } from './messaging/messaging.module';
import { ReviewsModule } from './reviews/reviews.module';
import { BusinessModule } from './business/business.module';
import { SafetyModule } from './safety/safety.module';
import { TrackingModule } from './tracking/tracking.module';
import { ModerationModule } from './moderation/moderation.module';
import { MarketingModule } from './marketing/marketing.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    RedisModule,
    QueueModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
    // GraphQL serves every READ (DUAL API RULE). Registered after AuthModule so
    // the globally-registered guards are available to resolvers too.
    GraphQLModule,
    UsersModule,
    // Typed domain events (SRS §17): business modules emit, the notification
    // dispatcher subscribes. Registered before NotificationsModule so its
    // @OnEvent listeners are bound at bootstrap.
    EventEmitterModule.forRoot({ global: true }),
    NotificationsModule,
    // The Trust Engine subscribes to nothing at bootstrap but emits tier/score
    // events that NotificationsModule's dispatcher consumes, so it is registered
    // after the emitter and after the dispatcher's own listeners are bound.
    TrustModule,
    // Object storage for portfolio media, KYC documents and business papers.
    // Registered before OnboardingModule, which resolves signed URLs through it.
    StorageModule,
    // Who may READ a stored document (TRU-08, NFR-SEC-04). Separate from
    // StorageModule, which owns the bytes.
    DocumentsModule,
    // Progressive verification and the agent/admin review pipeline. Registered
    // after TrustModule, whose ledger it reports outcomes into.
    VerificationModule,
    OnboardingModule,
    // The spatial stack (SRS §12): PostGIS proximity, reverse geocoding, and
    // MVT tiles. Registered after OnboardingModule, whose profiles carry the
    // coordinates it indexes.
    GeoModule,
    // The admin-managed service taxonomy (ADM-02). Registered before Search and
    // Profiles: both are scoped to it — search matches within it, and a worker
    // files their services under it.
    CatalogModule,
    // Discovery (DIS-04…DIS-08). After CatalogModule and GeoModule, whose
    // taxonomy and PostGIS geometry it queries through the `search` schema.
    SearchModule,
    // Worker and business profiles, read and owner-edited (PRO-01…PRO-07).
    ProfilesModule,
    // Saved workers — a personal shortlist onto a profile, not a trust signal.
    FavoritesModule,
    // Business, teams and corporate eligibility (BIZ-*). Before JobsModule,
    // which resolves a team job's company access through it, and after
    // VerificationModule, whose pipeline the RCCM check rides.
    BusinessModule,
    // Jobs & applications (SRS §6 JOB-*). After CatalogModule (jobs are scoped to
    // the taxonomy), GeoModule (job locations resolve their region) and
    // TrustModule (the Tier 2+ posting gate derives the poster's tier).
    JobsModule,
    // Quotes, negotiation and bookings (SRS §3.6 QTE-*, PAY-01 init). After
    // JobsModule, whose job state machine it drives on the first quote and on
    // acceptance.
    QuotesModule,
    // Payments, Wallet, Escrow & Disputes (SRS §15, PAY-*, ADM-05). After
    // QuotesModule, whose ESCROW_INITIATION_REQUESTED seam it consumes, and
    // JobsModule, whose job lifecycle the escrow machine drives.
    PaymentsModule,
    // Messaging (SRS §13, MSG-*). Its WS gateway lives in RealtimeModule, which
    // imports this module — so it is registered here for its REST/GraphQL surface.
    MessagingModule,
    // Reviews (REV-*). After PaymentsModule, whose booking states decide who may
    // review at all, and after TrustModule, whose ledger a qualifying review
    // reports into.
    ReviewsModule,
    // Safety & SOS (SOS-*). Shares alerts through the NotificationDispatcher.
    SafetyModule,
    // Live tracking (SOS-03). Foreground, consented, revocable position streaming
    // over its own WS gateway, persisted to PostGIS.
    TrackingModule,
    // Reporting & moderation (ADM-08). Registered last of the feature modules
    // because it acts ON the others: it soft-deletes their content and suspends
    // their authors, so it depends on all of them existing and none depend on it.
    ModerationModule,
    // Marketing content: the landing page's FAQ and testimonials (SRS §26.2).
    // Order is irrelevant here and that is the point — it is a leaf that depends
    // on nothing but Prisma, and nothing in the marketplace reads from it.
    MarketingModule,
    // The admin console's own surfaces (ADM-01, ADM-02, ADM-06, ADM-07):
    // cross-cutting analytics, the risk monitor, the account directory, agent
    // invitations, announcements, audit, RBAC and settings. Registered last of
    // the feature modules because it READS across all of them — and reads only:
    // the admin surfaces that WRITE (verification, trust, disputes, moderation,
    // taxonomy) stay in the modules that own those domains and their rules.
    AdminModule,
    // Rate limiting uses the Redis store so counts are shared across API
    // instances and survive process restarts (SRS §18, §24.1).
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Guard order matters and follows the cost of the check: rate-limit first
    // (cheapest, and it must apply to anonymous floods), then authentication,
    // then authorisation. Auth is DENY BY DEFAULT — a route is protected unless
    // it carries @Public(), so a new controller is never accidentally exposed
    // (NFR-SEC-02).
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // RequestIdMiddleware must run first so every downstream log/error carries the requestId.
    consumer.apply(RequestIdMiddleware, RequestLoggerMiddleware).forRoutes('*');
  }
}
