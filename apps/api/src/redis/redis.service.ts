import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Thin injectable wrapper around the shared ioredis connection. Feature modules
 * inject this (instead of the raw token) for a typed, discoverable surface:
 * the underlying client, a health `ping`, and a `duplicate` used by the WS
 * pub/sub adapter to spin up its dedicated pub/sub connections.
 */
@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) readonly client: Redis) {}

  /**
   * Returns true if Redis answers PONG. Never throws — a down Redis surfaces
   * as `false` so the health endpoint can report degraded rather than crash.
   */
  async ping(): Promise<boolean> {
    try {
      const reply = await this.client.ping();
      return reply === 'PONG';
    } catch {
      return false;
    }
  }

  /** A fresh connection cloned from the shared config (for the WS adapter). */
  duplicate(): Redis {
    return this.client.duplicate();
  }
}
