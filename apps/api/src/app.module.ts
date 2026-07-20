import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type { Redis } from 'ioredis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestIdMiddleware } from './lib/request-id.middleware';
import { RequestLoggerMiddleware } from './lib/request-logger.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { REDIS_CLIENT } from './redis/redis.constants';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    QueueModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
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
    // Global rate-limit guard; per-route @Throttle/@SkipThrottle can override.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // RequestIdMiddleware must run first so every downstream log/error carries the requestId.
    consumer.apply(RequestIdMiddleware, RequestLoggerMiddleware).forRoutes('*');
  }
}
