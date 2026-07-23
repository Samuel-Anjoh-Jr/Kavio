import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import fr from '../messages/fr.json';

/**
 * EN/FR message parity (SYS-03, NFR-I18N-01: "full English/French parity … no
 * hardcoded user-facing strings").
 *
 * A missing key does not crash next-intl — it silently renders the key path or
 * falls back, so a French user quietly sees `Marketing.hero.heading` where a
 * sentence should be. Nothing else catches that; this test does, by asserting
 * the two catalogues have exactly the same key set. A new EN string with no FR
 * twin fails CI, which is exactly when it is cheap to fix.
 *
 * Lives in lib/ rather than beside the catalogues because the vitest config
 * globs `lib/**` — the one place unit tests run from.
 */
function flatten(object: Record<string, unknown>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(flatten(value as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe('message catalogue parity', () => {
  const enKeys = new Set(flatten(en as Record<string, unknown>));
  const frKeys = new Set(flatten(fr as Record<string, unknown>));

  it('has every English key in French', () => {
    const missing = [...enKeys].filter((key) => !frKeys.has(key));
    expect(missing, `French is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('has no French key that English lacks', () => {
    const extra = [...frKeys].filter((key) => !enKeys.has(key));
    expect(extra, `French has orphan keys: ${extra.join(', ')}`).toEqual([]);
  });

  it('keeps legal section arrays the same length across locales', () => {
    // A clause present in one language and not the other is the subtle version
    // of a parity break a key-set check alone would miss.
    for (const page of ['terms', 'privacy', 'refunds'] as const) {
      const enSections = (en.Legal[page].sections as unknown[]).length;
      const frSections = (fr.Legal[page].sections as unknown[]).length;
      expect(frSections, `Legal.${page} section count`).toBe(enSections);
    }
  });
});
