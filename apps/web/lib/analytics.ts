'use client';

/**
 * The conversion-funnel analytics layer (SRS §26.6; PROMPT 93.1).
 *
 * Every event name lives in ONE typed constant. That is the whole discipline
 * here, and it is worth stating why: analytics event names are strings that
 * nothing type-checks and nothing tests, so a rename in one call site and not
 * another produces a funnel that silently loses a step — and the loss looks
 * exactly like users dropping out. A const plus a union type makes a typo a
 * build error instead of a bad dashboard.
 *
 * The funnel this is built to answer, end to end:
 *
 *   landing CTA -> sign-up -> OTP verified -> verification steps
 *               -> first job/quote -> first escrow
 *
 * NO PII EVER. Properties are for shape, not identity: a tier, a step name, a
 * placement. Not a phone number, not an email, not a job title someone typed.
 * `sanitizeProps` enforces that rather than trusting call sites to remember it.
 */

export const ANALYTICS_EVENTS = {
  // ── Acquisition ──────────────────────────────────────────────────────────
  LANDING_VIEW: 'landing_view',
  LANDING_CTA_CLICK: 'landing_cta_click',

  // ── Sign-up ──────────────────────────────────────────────────────────────
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_SUBMITTED: 'signup_submitted',
  OTP_VERIFIED: 'otp_verified',

  // ── Verification (progressive, Tiers 0–3) ────────────────────────────────
  VERIFICATION_STEP_STARTED: 'verification_step_started',
  VERIFICATION_STEP_SUBMITTED: 'verification_step_submitted',
  TIER_REACHED: 'tier_reached',

  // ── Marketplace activation ───────────────────────────────────────────────
  FIRST_JOB_POSTED: 'first_job_posted',
  FIRST_QUOTE_SENT: 'first_quote_sent',
  QUOTE_ACCEPTED: 'quote_accepted',

  // ── Money ────────────────────────────────────────────────────────────────
  FIRST_ESCROW_FUNDED: 'first_escrow_funded',
  ESCROW_RELEASED: 'escrow_released',

  // ── PWA ──────────────────────────────────────────────────────────────────
  INSTALL_PROMPT_SHOWN: 'install_prompt_shown',
  INSTALL_ACCEPTED: 'install_accepted',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Only primitives, and only non-identifying ones. See the module note. */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

/**
 * Property keys that must never be sent, matched case-insensitively as
 * substrings. Belt and braces beside the type: `AnalyticsProps` stops an object
 * being passed, but nothing stops someone assigning `{ email: user.email }`.
 */
const FORBIDDEN_KEY = /email|phone|name|address|token|password|nid|passport|account/i;

function sanitizeProps(props: AnalyticsProps): AnalyticsProps {
  const clean: AnalyticsProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    if (typeof value === 'string' && value.length > 64) continue;
    clean[key] = value;
  }
  return clean;
}

type Sink = (event: AnalyticsEvent, props: AnalyticsProps) => void;

/**
 * Where events go. Deliberately empty by default.
 *
 * No analytics vendor is chosen yet, and picking one here would either ship a
 * third-party script onto the page with the strictest performance budget in the
 * product (NFR-PERF-01) or bake a vendor's API into a hundred call sites. The
 * funnel is instrumented now; the destination is one `registerAnalyticsSink`
 * call whenever that decision is made.
 */
let sink: Sink | null = null;

export function registerAnalyticsSink(next: Sink): void {
  sink = next;
}

export function trackEvent(event: AnalyticsEvent, props: AnalyticsProps = {}): void {
  // Analytics must never be able to break a user flow. A sink that throws is a
  // vendor's bug; a checkout that dies because of it would be ours.
  try {
    const clean = sanitizeProps(props);

    if (sink) {
      sink(event, clean);
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.debug('[analytics]', event, clean);
    }
  } catch {
    // Intentionally swallowed.
  }
}
