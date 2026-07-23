/**
 * Decimal ratings to a star breakdown (SRS §26.2: "ratings render decimals with
 * half-stars (4.3 -> 4 full + 1 half), aria-labelled, always computed
 * server-side").
 *
 * SERVER-SIDE IS THE REQUIREMENT, and it earns its place: the same rating is
 * rendered on the landing page, in search results and on a worker profile, and
 * three independent client-side rounding implementations is three chances to
 * disagree about whether a 4.25 shows four stars or four and a half. One
 * function, one answer, shipped in the payload.
 *
 * Rounding is to the NEAREST HALF, which is what makes the specified example
 * work: 4.3 rounds to 4.5 and renders as 4 full + 1 half. The alternative —
 * truncating the fraction and showing a half for anything above zero — would
 * render 4.1 identically to 4.9, overstating the first and understating the
 * second.
 */

export const MAX_STARS = 5;

export interface StarBreakdown {
  /** Whole stars to fill. */
  full: number;
  /** At most one, by construction. */
  half: number;
  /** Outlines making the row up to MAX_STARS, so a renderer never has to count. */
  empty: number;
  /** The rating rounded to the half actually drawn — what the aria-label states. */
  rounded: number;
}

export function toStarBreakdown(rating: number): StarBreakdown {
  // A rating outside 0–5 is a data error, not something to render creatively;
  // clamping keeps a bad row from producing a negative `empty` and breaking the
  // whole page's layout.
  const clamped = Math.min(Math.max(Number.isFinite(rating) ? rating : 0, 0), MAX_STARS);

  const rounded = Math.round(clamped * 2) / 2;
  const full = Math.floor(rounded);
  const half = rounded - full === 0.5 ? 1 : 0;

  return { full, half, empty: MAX_STARS - full - half, rounded };
}
