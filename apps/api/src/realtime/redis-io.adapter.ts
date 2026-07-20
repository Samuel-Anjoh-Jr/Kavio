import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { ServerOptions, Server } from 'socket.io';
import { createLogger } from '../lib/logger';
import { RedisService } from '../redis/redis.service';

const logger = createLogger('ws-adapter');

/**
 * Socket.IO adapter backed by Redis pub/sub. Every WS gateway broadcast is
 * fanned out through Redis so multiple API instances share a single logical
 * socket namespace — a message emitted on instance A reaches clients connected
 * to instance B. This is what lets the WS gateways scale horizontally (SRS §16).
 *
 * The pub/sub pair is duplicated from the shared RedisModule connection so it
 * inherits the same URL/auth/TLS config in one place.
 */
export class RedisIoAdapter extends IoAdapter {
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(
    app: INestApplicationContext,
    private readonly redis: RedisService,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, options) as Server;

    this.pubClient = this.redis.duplicate();
    this.subClient = this.redis.duplicate();
    server.adapter(createAdapter(this.pubClient, this.subClient));

    logger.info('Socket.IO Redis pub/sub adapter attached');
    return server;
  }

  override async close(): Promise<void> {
    await Promise.all([
      this.pubClient?.quit().catch(() => this.pubClient?.disconnect()),
      this.subClient?.quit().catch(() => this.subClient?.disconnect()),
    ]);
  }
}
