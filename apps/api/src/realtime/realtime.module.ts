import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingGateway } from './messaging.gateway';
import { PresenceService } from './presence.service';
import { SystemGateway } from './system.gateway';

/**
 * Houses the WebSocket gateways (SRS §13, §16). The Redis pub/sub adapter that
 * lets these gateways scale horizontally is installed in main.ts (RedisIoAdapter)
 * because the adapter is an app-level concern applied before listening.
 *
 * Imports MessagingModule (not the other way round) so MessagingGateway can reach
 * MessagingService for delivery/read side effects without a module cycle: the
 * write path (REST) emits domain events, and the gateway — living here — turns
 * them into live socket delivery.
 */
@Module({
  imports: [PrismaModule, MessagingModule],
  providers: [SystemGateway, MessagingGateway, PresenceService],
  exports: [SystemGateway, PresenceService],
})
export class RealtimeModule {}
