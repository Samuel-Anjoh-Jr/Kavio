import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing (ACC-08).
 *
 * scrypt from Node's own crypto is used rather than bcrypt/argon2 because it is
 * memory-hard, audited, and needs no native build — the API runs on Bun on
 * Windows/Linux/CI alike, and a native postinstall is a real portability risk
 * for something this load-bearing.
 *
 * Parameters follow the OWASP Password Storage Cheat Sheet minimum for scrypt
 * (N=2^15, r=8, p=1 ≈ 32 MB per hash). They are encoded INTO the stored string,
 * so raising the cost later re-hashes on next login without breaking old hashes.
 */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;

/** scrypt needs maxmem raised above the 32 MB default for N=2^15. */
const MAX_MEM = 128 * SCRYPT_N * SCRYPT_R * 2;

const PREFIX = 'scrypt';

/**
 * Wrapped by hand rather than with `promisify`: promisify resolves to the
 * overload without an options argument, and the cost parameters are exactly what
 * must not be dropped here.
 */
function derive(plain: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      plain.normalize('NFKC'),
      salt,
      KEY_BYTES,
      { N: n, r, p, maxmem: MAX_MEM },
      (error, derivedKey) => (error ? reject(error) : resolve(derivedKey)),
    );
  });
}

/**
 * Returns a self-describing hash: `scrypt$N$r$p$salt$key` (both base64). Storing
 * the parameters is what makes the cost upgradable.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(plain, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);

  return [
    PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/**
 * Constant-time verification. Never throws: a malformed or legacy hash returns
 * false rather than surfacing a 500 that would leak which accounts are broken.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== PREFIX) {
      return false;
    }

    const [, nRaw, rRaw, pRaw, saltB64, keyB64] = parts as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];

    const n = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
      return false;
    }

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = await derive(plain, salt, n, r, p);

    // timingSafeEqual throws on a length mismatch, so guard it first.
    if (actual.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Burns roughly one hash's worth of time for a login attempt against an account
 * that does not exist or has no password set. Without this, response time alone
 * tells an attacker which phone numbers are registered (user enumeration).
 */
export async function burnPasswordTiming(): Promise<void> {
  await derive('timing-equalisation', Buffer.alloc(SALT_BYTES), SCRYPT_N, SCRYPT_R, SCRYPT_P);
}
