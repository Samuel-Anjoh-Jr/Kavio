import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackingController } from './tracking.controller';
import { TrackingGateway } from './tracking.gateway';
import { TrackingReadService } from './tracking-read.service';
import { TrackingResolver } from './tracking.resolver';
import { TrackingService } from './tracking.service';

/**
 * Live tracking (PROMPT 74; SOS-03; CLAUDE.md SPATIAL foreground streaming).
 *
 * Session lifecycle is REST (TrackingController), reads are GraphQL
 * (TrackingResolver), and the position stream is the WS gateway — foreground,
 * consented, revocable. The gateway lives in this module (not RealtimeModule) so
 * it can reach TrackingService directly without a cross-module cycle; it reuses
 * the shared ws-auth helper for handshake authentication.
 */
@Module({
  imports: [PrismaModule],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingReadService, TrackingResolver, TrackingGateway],
  exports: [TrackingService],
})
export class TrackingModule {}
