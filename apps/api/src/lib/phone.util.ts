/**
 * Phone-number normalisation. Numbers are stored in E.164 at capture so that
 * SMS (deferred, paid API later) flips on with zero call-site changes — the
 * dispatcher just starts reading an already-canonical value.
 *
 * Launch market is Cameroon only, so this implements the CM plan directly
 * rather than pulling in a full libphonenumber dataset. The signature takes a
 * `region` so additional markets slot in later without touching call sites.
 */

/** ISO 3166-1 alpha-2 codes we can normalise today. */
export type SupportedRegion = 'CM';

/**
 * Cameroon (CC +237): the national significant number is exactly 9 digits and
 * starts with 2 (fixed line) or 6 (mobile) since the 2015 renumbering.
 */
const CAMEROON = {
  countryCode: '237',
  /** national significant number: 9 digits starting 2 or 6 */
  nsn: /^[26]\d{8}$/,
} as const;

/**
 * Normalise a raw, human-entered phone number to E.164 (e.g. `+2376XXXXXXXX`).
 * Accepts spacing, dashes, parentheses, a leading `+`, a `00` international
 * prefix, and an optional `237` country code. Returns `null` when the input
 * cannot be a valid number for the region, so callers own the error contract.
 */
export function normalizeToE164(raw: string, region: SupportedRegion = 'CM'): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  // Strip every non-digit; a leading `+` carries no extra information once we
  // reason about the `00` prefix and country code explicitly below.
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 0) {
    return null;
  }

  // `00` is the international call prefix; drop it before inspecting the CC.
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // region is currently always 'CM'; kept explicit for future markets.
  void region;

  // Strip the country code only when it leaves a full 9-digit NSN, so a bare
  // national number is never mistaken for one carrying the CC.
  if (
    digits.length === CAMEROON.countryCode.length + 9 &&
    digits.startsWith(CAMEROON.countryCode)
  ) {
    digits = digits.slice(CAMEROON.countryCode.length);
  }

  if (!CAMEROON.nsn.test(digits)) {
    return null;
  }

  return `+${CAMEROON.countryCode}${digits}`;
}
