'use client';

/**
 * Gated-action intent capture and replay (ACC-02).
 *
 * A guest who taps "Apply" has already decided to apply. Sending them to login
 * and then dropping them on a home screen throws that decision away, so the
 * intent — including any work already typed, like a drafted job — is captured
 * before the redirect and replayed after a successful sign-in.
 */

/** The state-changing actions that require an account (CLAUDE.md ACCESS MODEL). */
export const GATED_ACTIONS = [
  'post_job',
  'apply_job',
  'contact_worker',
  'request_quote',
  'pay',
  'save_favorite',
  'submit_review',
  'report_content',
] as const;

export type GatedAction = (typeof GATED_ACTIONS)[number];

export interface GatedIntent {
  action: GatedAction;
  /** Where to land after auth — the screen the action was taken on. */
  returnTo: string;
  /** In-progress work to restore, e.g. a drafted job. Never secrets. */
  payload?: Record<string, unknown>;
  capturedAt: number;
}

const STORAGE_KEY = 'trustpro.pending-intent';

/**
 * Intents die after an hour. A replay from a stale tab days later would drop the
 * user into a half-remembered flow they have no context for.
 */
const INTENT_TTL_MS = 60 * 60 * 1000;

function isGatedAction(value: unknown): value is GatedAction {
  return typeof value === 'string' && (GATED_ACTIONS as readonly string[]).includes(value);
}

/** sessionStorage, not localStorage: an intent belongs to one browsing session. */
export function captureIntent(intent: Omit<GatedIntent, 'capturedAt'>): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...intent, capturedAt: Date.now() } satisfies GatedIntent),
    );
  } catch {
    // Private browsing or a full quota. The redirect still works; only the
    // replay is lost, which is a degraded flow rather than a broken one.
  }
}

export function peekIntent(): GatedIntent | null {
  if (typeof window === 'undefined') return null;

  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<GatedIntent>;

    if (
      !isGatedAction(parsed.action) ||
      typeof parsed.returnTo !== 'string' ||
      typeof parsed.capturedAt !== 'number' ||
      Date.now() - parsed.capturedAt > INTENT_TTL_MS
    ) {
      clearIntent();
      return null;
    }

    // An absolute or protocol-relative URL here would be an open-redirect: the
    // value is written by client code but read back after an auth bounce, so it
    // is treated as untrusted and must stay an in-app path.
    if (!parsed.returnTo.startsWith('/') || parsed.returnTo.startsWith('//')) {
      clearIntent();
      return null;
    }

    return parsed as GatedIntent;
  } catch {
    clearIntent();
    return null;
  }
}

/** Reads and removes the intent — replay happens exactly once. */
export function consumeIntent(): GatedIntent | null {
  const intent = peekIntent();
  clearIntent();
  return intent;
}

export function clearIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; a stale entry expires on its own via INTENT_TTL_MS.
  }
}

/** Same open-redirect guard, for the `?next=` parameter on the auth screens. */
export function safeReturnTo(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  return value;
}
