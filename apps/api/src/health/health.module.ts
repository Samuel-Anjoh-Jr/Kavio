import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Health probe endpoint (GET /health). RedisService and PrismaService come from
 * their global modules, so no imports are needed here.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
