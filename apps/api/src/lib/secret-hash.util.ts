import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Hashing and generation for short-lived secrets: OTP codes, refresh tokens and
 * password-reset tokens (ACC-04, ACC-05, ACC-08).
 *
 * These are NOT passwords. They are high-entropy (or rate-limited, in the OTP
 * case) and verified on a hot path, so a deliberately slow KDF is the wrong tool.
 * They are stored as HMAC-SHA-256 digests keyed by a server-side pepper, which
 * means a leaked database alone yields nothing replayable: an attacker would also
 * need the pepper, which never leaves the environment.
 */

const PEPPER_ENV = 'AUTH_SECRET_PEPPER';

/**
 * Falls back to the refresh secret so a deployment that has run `pnpm keys` is
 * already correctly peppered. Throws only when nothing at all is configured,
 * because silently hashing with an empty key would look fine and protect nothing.
 */
function getPepper(env: NodeJS.ProcessEnv = process.env): string {
  const pepper = env[PEPPER_ENV]?.trim() || env.JWT_REFRESH_SECRET?.trim();

  if (!pepper) {
    throw new Error(
      `${PEPPER_ENV} (or JWT_REFRESH_SECRET) must be set — refusing to hash auth secrets with an empty key. Run \`pnpm keys\`.`,
    );
  }

  return pepper;
}

/** Keyed digest of a one-time secret, safe to persist. */
export function hashSecret(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return createHmac('sha256', getPepper(env)).update(value).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function secretHashEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');

  if (bufA.length === 0 || bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * A uniformly random numeric code of `length` digits, leading zeros preserved.
 * `randomInt` is rejection-sampled by Node, so unlike `Math.random() * range`
 * this has no modulo bias — which matters when the whole space is only 10^6.
 */
export function generateNumericCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += String(randomInt(0, 10));
  }
  return code;
}

/** A high-entropy URL-safe token for refresh/reset flows (default 256 bits). */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Masks a delivery address for display ("j•••@mail.com", "+237 6•• •• •• 42").
 * The client needs to tell the user WHERE the code went without the response
 * itself becoming a way to harvest full contact details.
 */
export function maskDestination(destination: string): string {
  if (destination.includes('@')) {
    const atIndex = destination.indexOf('@');
    const local = destination.slice(0, atIndex);
    const domain = destination.slice(atIndex + 1);
    const head = local.slice(0, 1);
    return `${head}${'•'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
  }

  const tail = destination.slice(-2);
  const head = destination.slice(0, 4);
  return `${head}${'•'.repeat(Math.max(destination.length - 6, 1))}${tail}`;
}
