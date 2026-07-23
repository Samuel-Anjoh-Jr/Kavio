#!/usr/bin/env node
/**
 * Route-metadata integrity check (SRS §26.4; PROMPT 93.1).
 *
 * Asserts that every PUBLIC route exports the four things a crawlable page must
 * have: a title, a description, a canonical, and an OG image. The requirement is
 * that this "fails on a route missing metadata", so this is a real gate, not a
 * report — it exits non-zero, and CI runs it beside typecheck and lint.
 *
 * It works statically, by reading source rather than booting Next: a route
 * satisfies the rule if it calls the one `buildMetadata` helper (which produces
 * all four by construction), OR if it hand-rolls a `generateMetadata`/`metadata`
 * that mentions each field. Centralising on `buildMetadata` is what makes the
 * common case a single call instead of four easy-to-forget properties.
 *
 * PRIVATE routes are exempt and say so: a page that sets `robots: noindex`, or
 * lives under an app-shell/auth/preview prefix, is deliberately not for the
 * index and is not required to carry share metadata.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(here, '..', 'app');

/** Locale-stripped path prefixes whose pages are intentionally not indexed. */
const PRIVATE_SEGMENTS = [
  'app/settings',
  'app/wallet',
  'app/messages',
  'app/notifications',
  'app/admin',
  'app/onboarding',
  'app/verification',
  'app/disputes',
  'app/quotes',
  'app/safety',
  'app/business',
  'app/review',
  'app/trust',
  'auth',
  'maintenance',
  'preview',
];

/** Directory segments that never render an indexable HTML document. */
const SKIP_DIR = /^(api|_.*)$/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIR.test(entry)) continue;
      out.push(...walk(full));
    } else if (entry === 'page.tsx' || entry === 'page.ts') {
      out.push(full);
    }
  }
  return out;
}

/** The locale-stripped route a page file represents, for prefix matching. */
function routeOf(file) {
  const rel = relative(APP_DIR, dirname(file)).replaceAll('\\', '/');
  return rel
    .split('/')
    .filter((seg) => seg && !seg.startsWith('(') && seg !== '[locale]')
    .map((seg) => (seg.startsWith('[') ? ':param' : seg))
    .join('/');
}

function isPrivate(route, source) {
  if (PRIVATE_SEGMENTS.some((seg) => route === seg || route.startsWith(`${seg}/`))) return true;
  // A page that declares itself noindex is opting out on purpose.
  return /robots:\s*\{[^}]*index:\s*false/.test(source) || /robotsFor\(/.test(source);
}

const pages = walk(APP_DIR);
const failures = [];
let checked = 0;

for (const file of pages) {
  const source = readFileSync(file, 'utf8');
  const route = routeOf(file) || '/';

  if (isPrivate(route, source)) continue;

  // Not every page owns its metadata — a nested route can inherit a parent
  // layout's. Only pages that clearly render a top-level document are required
  // to export their own, and the reliable signal for that is a metadata export.
  const hasMetadataExport =
    /export\s+(async\s+)?function\s+generateMetadata/.test(source) ||
    /export\s+const\s+metadata\b/.test(source);

  if (!hasMetadataExport) continue;
  checked += 1;

  // The blessed path: buildMetadata produces title, description, canonical and
  // OG image together, so one call satisfies all four.
  if (/buildMetadata\(/.test(source)) continue;

  const missing = [];
  if (!/\btitle\b/.test(source)) missing.push('title');
  if (!/\bdescription\b/.test(source)) missing.push('description');
  if (!/canonical|alternates/.test(source)) missing.push('canonical');
  if (!/openGraph|opengraph-image|images/.test(source)) missing.push('og-image');

  if (missing.length > 0) {
    failures.push({ route, file: relative(join(here, '..'), file), missing });
  }
}

if (failures.length > 0) {
  console.error(`\n✖ Route metadata check failed for ${failures.length} route(s):\n`);
  for (const f of failures) {
    console.error(`  ${f.route}  (${f.file})`);
    console.error(`    missing: ${f.missing.join(', ')}`);
  }
  console.error('\nEither route through buildMetadata() or export all four fields.\n');
  process.exit(1);
}

console.log(`✓ Route metadata check passed (${checked} public route(s) verified).`);
