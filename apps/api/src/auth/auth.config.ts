/**
 * Auth configuration, read from the environment in ONE place (ACC-04, ACC-05,
 * ACC-08). Nothing below reaches for `process.env` at a call site, so every knob
 * is discoverable here and tests can drive a config object instead of globals.
 */

import { randomBytes } from 'node:crypto';

/** Parses `15m` / `30d` / `900` (bare seconds) into seconds. */
export function parseDuration(value: string, fallbackSeconds: number): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(value.trim());
  if (!match) {
    return fallbackSeconds;
  }

  const amount = Number(match[1]);
  switch (match[2]) {
    case 'ms':
      return Math.ceil(amount / 1000);
    case 'h':
      return amount * 3600;
    case 'd':
      return amount * 86400;
    case 'm':
      return amount * 60;
    case 's':
    case undefined:
      return amount;
    default:
      return fallbackSeconds;
  }
}

function readNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP
// ─────────────────────────────────────────────────────────────────────────────

export interface OtpConfig {
  /** Digits in the code. Six per ACC-04. */
  length: number;
  ttlMs: number;
  /** Wrong guesses allowed before the code is burned. */
  maxAttempts: number;
  /** Minimum gap between sends — drives the resend countdown in the UI. */
  resendCooldownMs: number;
  /** Hard cap on codes issued per user+purpose inside `windowMs`. */
  maxPerWindow: number;
  windowMs: number;
}

export function getOtpConfig(env: NodeJS.ProcessEnv = process.env): OtpConfig {
  return {
    length: readNumber(env.OTP_CODE_LENGTH, 6),
    ttlMs: readNumber(env.OTP_TTL_SECONDS, 600) * 1000,
    maxAttempts: readNumber(env.OTP_MAX_ATTEMPTS, 5),
    resendCooldownMs: readNumber(env.OTP_RESEND_COOLDOWN_SECONDS, 60) * 1000,
    maxPerWindow: readNumber(env.OTP_MAX_PER_WINDOW, 5),
    windowMs: readNumber(env.OTP_WINDOW_SECONDS, 3600) * 1000,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT
// ─────────────────────────────────────────────────────────────────────────────

export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  issuer: string;
  audience: string;
}

/**
 * Dev-only fallback secrets. Booting without real secrets is allowed locally so
 * a fresh clone runs, but it is LOUD, and in production a missing secret is a
 * hard boot failure — never a silent downgrade to a guessable key. Generated at
 * process start rather than hardcoded, so it's never a static guessable value
 * and never trips secret-scanners; it only needs to be stable within one run.
 */
const DEV_ACCESS_SECRET = randomBytes(32).toString('hex');
const DEV_REFRESH_SECRET = randomBytes(32).toString('hex');

function requireSecret(
  value: string | undefined,
  name: string,
  devFallback: string,
  isProduction: boolean,
): string {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }

  if (isProduction) {
    throw new Error(`${name} must be set in production. Generate secrets with \`pnpm keys\`.`);
  }

  console.warn(
    `[auth] ${name} is not set — falling back to a PUBLIC development secret. Run \`pnpm keys\` before deploying.`,
  );
  return devFallback;
}

export function getJwtConfig(env: NodeJS.ProcessEnv = process.env): JwtConfig {
  const isProduction = env.NODE_ENV === 'production';

  return {
    accessSecret: requireSecret(
      env.JWT_ACCESS_SECRET,
      'JWT_ACCESS_SECRET',
      DEV_ACCESS_SECRET,
      isProduction,
    ),
    refreshSecret: requireSecret(
      env.JWT_REFRESH_SECRET,
      'JWT_REFRESH_SECRET',
      DEV_REFRESH_SECRET,
      isProduction,
    ),
    accessTtlSeconds: parseDuration(env.JWT_ACCESS_EXPIRES_IN ?? '15m', 900),
    refreshTtlSeconds: parseDuration(env.JWT_REFRESH_EXPIRES_IN ?? '30d', 2_592_000),
    issuer: env.JWT_ISSUER?.trim() || 'kavio',
    audience: env.JWT_AUDIENCE?.trim() || 'kavio-web',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Password reset
// ─────────────────────────────────────────────────────────────────────────────

export interface PasswordResetConfig {
  ttlMs: number;
  /** Reset links point at the web app, not the API. */
  resetPath: string;
}

export function getPasswordResetConfig(env: NodeJS.ProcessEnv = process.env): PasswordResetConfig {
  return {
    ttlMs: readNumber(env.PASSWORD_RESET_TTL_SECONDS, 3600) * 1000,
    resetPath: env.PASSWORD_RESET_PATH?.trim() || '/auth/reset-password',
  };
}

/**
 * Minimum password policy. Deliberately length-first rather than a composition
 * rule: the users are non-technical and mobile-first, and NIST 800-63B has
 * dropped forced character classes in favour of length + breach screening.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
