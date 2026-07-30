/**
 * Payments configuration (PAY-04, SRS §15).
 *
 * Every knob money behaviour depends on is read here, once, from the environment
 * — the Campay credentials, the platform fee, and the sandbox-stub switch that
 * lets the escrow flow run end-to-end on a laptop with no Campay account. A
 * missing credential does not crash the app: it flips the client into stub mode,
 * so local development and CI exercise the same state machine the live rail does.
 */

export interface CampayConfig {
  baseUrl: string;
  username: string;
  password: string;
  /** Shared secret Campay signs webhook payloads with (PAY-06). */
  webhookKey: string;
}

export function getCampayConfig(): CampayConfig {
  return {
    baseUrl: (process.env.CAMPAY_BASE_URL ?? 'https://demo.campay.net').replace(/\/+$/, ''),
    username: process.env.CAMPAY_APP_USERNAME ?? '',
    password: process.env.CAMPAY_APP_PASSWORD ?? '',
    webhookKey: process.env.CAMPAY_WEBHOOK_KEY ?? '',
  };
}

/**
 * True when real Campay credentials are present. When false the CampayService
 * runs in STUB mode: collections and payouts resolve as if the operator confirmed
 * instantly, which is what makes "a test collection + payout succeed in sandbox"
 * (PROMPT 62 Done) reproducible without a live account. Never true in production
 * unless the credentials are actually set.
 */
export function isCampayLive(config: CampayConfig = getCampayConfig()): boolean {
  return Boolean(config.username && config.password);
}

/**
 * True when the configured base URL is Campay's own shared sandbox
 * (https://demo.campay.net), as opposed to a real Campay production account.
 * The sandbox settles REAL Mobile Money prompts — unlike CampayService's
 * offline stub (isCampayLive() === false) — but only ever accepts a fixed
 * small test amount, so a request for the real quoted amount is simply
 * rejected there. CampayService uses this to cap what is actually SENT to
 * Campay at getCampayDemoAmountXaf() while every internal record (ledger,
 * escrow, wallet balance) still carries the real amount, so a walkthrough can
 * show a genuine USSD prompt and settlement for a quote of any size without
 * moving real money.
 */
export function isCampayDemo(config: CampayConfig = getCampayConfig()): boolean {
  try {
    return new URL(config.baseUrl).hostname === 'demo.campay.net';
  } catch {
    return false;
  }
}

/** The fixed amount Campay's shared sandbox accepts, whatever was actually requested. */
export function getCampayDemoAmountXaf(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.CAMPAY_DEMO_AMOUNT_XAF ?? 25);
  return Number.isInteger(raw) && raw > 0 ? raw : 25;
}

/**
 * The platform service fee in basis points (SRS §15.1 "~10%, admin configurable"),
 * read from the environment. This is the FLOOR default: `PlatformSettingsService
 * .platformFeeBps()` is what call sites actually use, and falls back to this
 * value when no admin has ever set `platform.feePercent` (or the stored value is
 * out of range). The split maths itself lives in the shared, tested
 * `computeFeeSplit`.
 */
export function getPlatformFeeBps(): number {
  const raw = Number(process.env.PLATFORM_FEE_BPS ?? 1000);
  if (!Number.isInteger(raw) || raw < 0 || raw > 10_000) {
    return 1000;
  }
  return raw;
}

/** Bounds for wallet Add-Money / Withdraw amounts, in whole XAF. */
export const WALLET_MIN_AMOUNT = 100;
export const WALLET_MAX_AMOUNT = 5_000_000;
