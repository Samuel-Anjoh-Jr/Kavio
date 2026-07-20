import { Module } from '@nestjs/common';
import { SystemGateway } from './system.gateway';

/**
 * Houses the WebSocket gateways. The Redis pub/sub adapter that lets these
 * gateways scale horizontally is installed in main.ts (RedisIoAdapter) because
 * the adapter is an app-level concern applied before listening.
 */
@Module({
  providers: [SystemGateway],
  exports: [SystemGateway],
})
export class RealtimeModule {}
