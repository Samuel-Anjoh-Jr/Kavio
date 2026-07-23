/**
 * iOS launch images (SYS-01).
 *
 * Android and desktop derive a splash screen from the manifest automatically
 * (name + icon + background_color). iOS does not: Safari shows a blank white
 * rectangle unless an `apple-touch-startup-image` matches the device's exact
 * viewport AND orientation, which is why this is a hand-maintained device list
 * rather than something computed.
 *
 * The list covers the phone sizes that actually matter for TrustPro's users
 * rather than every iOS device ever shipped — an unmatched device falls back to
 * the blank default, which is the same thing it would get with no list at all,
 * so the cost of an omission is zero and the cost of exhaustiveness is a
 * head full of link tags on every page load.
 */
export interface SplashSpec {
  /** CSS pixels. */
  width: number;
  height: number;
  /** Device pixel ratio the media query must match. */
  ratio: number;
  orientation: 'portrait' | 'landscape';
}

export const SPLASH_SPECS: SplashSpec[] = [
  // iPhone SE / 8 and similar 4.7"
  { width: 375, height: 667, ratio: 2, orientation: 'portrait' },
  // iPhone 11 / XR
  { width: 414, height: 896, ratio: 2, orientation: 'portrait' },
  // iPhone 12/13/14 and 15/16 base
  { width: 390, height: 844, ratio: 3, orientation: 'portrait' },
  { width: 393, height: 852, ratio: 3, orientation: 'portrait' },
  // iPhone Pro Max sizes
  { width: 428, height: 926, ratio: 3, orientation: 'portrait' },
  { width: 430, height: 932, ratio: 3, orientation: 'portrait' },
  // iPad 10.2" / 11" — the two the admin console is realistically used on
  { width: 810, height: 1080, ratio: 2, orientation: 'portrait' },
  { width: 834, height: 1194, ratio: 2, orientation: 'portrait' },
];

/** The route path that renders one spec, in device pixels. */
export function splashHref(basePath: string, spec: SplashSpec): string {
  return `${basePath}/splash/${spec.width * spec.ratio}x${spec.height * spec.ratio}`;
}

export function splashMedia(spec: SplashSpec): string {
  return `(device-width: ${spec.width}px) and (device-height: ${spec.height}px) and (-webkit-device-pixel-ratio: ${spec.ratio}) and (orientation: ${spec.orientation})`;
}

/** Parses the `WxH` route segment, rejecting anything not on the known list. */
export function parseSplashSize(spec: string): { width: number; height: number } | null {
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(spec);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);

  // Only sizes this app actually asks for are generated. An open size parameter
  // is an invitation to burn server CPU rendering arbitrary images on demand.
  const known = SPLASH_SPECS.some(
    (s) => s.width * s.ratio === width && s.height * s.ratio === height,
  );

  return known ? { width, height } : null;
}
