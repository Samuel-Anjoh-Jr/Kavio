import type { RedisOptions } from 'ioredis';

/**
 * Parse a REDIS_URL (redis:// or rediss://) into ioredis connection options.
 * BullMQ needs a plain options object (so it can spin up its own dedicated
 * blocking connections per worker) rather than a shared client instance.
 */
export function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  const db = parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.slice(1)) : 0;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isFinite(db) ? db : 0,
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
