/**
 * Injection token for the shared ioredis connection. Everything that is NOT
 * BullMQ (rate-limit store, WS pub/sub adapter, health ping, ad-hoc commands)
 * reuses this single connection. BullMQ builds its own connections from
 * REDIS_URL so its blocking commands never starve this shared client.
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
