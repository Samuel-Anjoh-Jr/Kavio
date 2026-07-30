import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createLogger } from '../lib/logger';
import { wsCorsOptions } from './ws-cors.config';

const logger = createLogger('system-gateway');

/**
 * Minimal reference gateway that exercises the Redis pub/sub adapter. Clients
 * can subscribe to a room and receive `system:broadcast` events; because the
 * adapter is Redis-backed, a broadcast triggered on ANY API instance reaches
 * every subscribed client regardless of which instance they connected to.
 *
 * Real feature gateways (live location, chat) follow this same shape and rely
 * on the same shared adapter for horizontal scaling.
 */
@WebSocketGateway({ namespace: '/system', cors: wsCorsOptions() })
export class SystemGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  handleConnection(client: Socket): void {
    logger.info('WS client connected', { payload: { socketId: client.id } });
  }

  handleDisconnect(client: Socket): void {
    logger.info('WS client disconnected', { payload: { socketId: client.id } });
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, room: string): { room: string } {
    const target = typeof room === 'string' && room.length > 0 ? room : 'global';
    void client.join(target);
    return { room: target };
  }

  /**
   * Broadcast to a room across ALL instances via the Redis adapter. Feature
   * modules call this (or inject the server) to fan out real-time updates.
   */
  broadcast(room: string, event: string, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }
}
