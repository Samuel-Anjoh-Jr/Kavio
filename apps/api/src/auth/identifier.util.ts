import type { Prisma } from '@kavio/database';
import { normalizeToE164 } from '../lib/phone.util';

/**
 * Resolves the single "phone or email" sign-in field into a canonical lookup.
 *
 * Normalisation happens HERE and nowhere else, so a user who typed
 * `677 12 34 56` at sign-up and `+237677123456` at login lands on the same row —
 * a mismatch here would read to the user as "wrong password".
 */
export type ResolvedIdentifier =
  { kind: 'email'; value: string } | { kind: 'phone'; value: string };

export function resolveIdentifier(raw: string): ResolvedIdentifier | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes('@')) {
    const email = normalizeEmail(trimmed);
    return isPlausibleEmail(email) ? { kind: 'email', value: email } : null;
  }

  const phone = normalizeToE164(trimmed);
  return phone ? { kind: 'phone', value: phone } : null;
}

/** Case-insensitive storage: addresses are compared as lowercase everywhere. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Shape check only. Real validity is proven by the verification code actually
 * arriving, which is a far better test than any regex.
 */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value) && value.length <= 320;
}

/** Turns a resolved identifier into a Prisma unique-lookup clause. */
export function identifierWhere(identifier: ResolvedIdentifier): Prisma.UserWhereUniqueInput {
  return identifier.kind === 'email' ? { email: identifier.value } : { phone: identifier.value };
}
