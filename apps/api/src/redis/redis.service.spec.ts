import type { Redis } from 'ioredis';
import { RedisService } from './redis.service';
import { parseRedisUrl } from './redis.util';

describe('RedisService', () => {
  it('ping() returns true when Redis answers PONG', async () => {
    const client = { ping: jest.fn().mockResolvedValue('PONG') } as unknown as Redis;
    const service = new RedisService(client);
    await expect(service.ping()).resolves.toBe(true);
  });

  it('ping() returns false (never throws) when Redis is down', async () => {
    const client = {
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as Redis;
    const service = new RedisService(client);
    await expect(service.ping()).resolves.toBe(false);
  });

  it('duplicate() clones the underlying connection', () => {
    const clone = {} as Redis;
    const client = { duplicate: jest.fn().mockReturnValue(clone) } as unknown as Redis;
    const service = new RedisService(client);
    expect(service.duplicate()).toBe(clone);
  });
});

describe('parseRedisUrl', () => {
  it('parses host, port and db from a redis:// URL', () => {
    expect(parseRedisUrl('redis://localhost:6379/2')).toMatchObject({
      host: 'localhost',
      port: 6379,
      db: 2,
    });
  });

  it('extracts credentials and enables TLS for rediss://', () => {
    const opts = parseRedisUrl('rediss://user:p%40ss@redis.example.com:6380');
    expect(opts).toMatchObject({
      host: 'redis.example.com',
      port: 6380,
      username: 'user',
      password: 'p@ss',
    });
    expect(opts.tls).toBeDefined();
  });

  it('defaults db to 0 when no path is present', () => {
    expect(parseRedisUrl('redis://localhost:6379').db).toBe(0);
  });
});
