/**
 * Slug generation for the service taxonomy (ADM-02).
 *
 * A category's slug is its STABLE key: saved filters, shared search links and
 * job posts all reference it, so it is generated once at creation and never
 * changes afterwards — renaming "Plumbing" to "Plumbing & drainage" in either
 * language must not break a link somebody sent on WhatsApp.
 *
 * Generated from the ENGLISH name because a slug is a URL token, not user-facing
 * copy: one canonical key per category, rather than a French URL and an English
 * URL for the same thing.
 */

/**
 * Latin-1 accents mapped to their ASCII equivalents.
 *
 * Half this catalogue is French ("Électricité", "Réparation d'appareils"), and
 * percent-encoded accents in a URL are unreadable and get mangled when pasted
 * into a chat. `String.normalize('NFD')` strips the combining marks that most
 * accents decompose into; the explicit pairs below cover the ones it cannot,
 * because œ, æ and ß have no combining form to remove.
 */
const UNDECOMPOSABLE: Readonly<Record<string, string>> = {
  œ: 'oe',
  æ: 'ae',
  ø: 'o',
  ß: 'ss',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ł: 'l',
};

/** Longest slug we will generate. Long enough for any real trade name. */
export const MAX_SLUG_LENGTH = 64;

/**
 * Converts a display name into a URL-safe slug.
 *
 * Returns an empty string when the input holds nothing sluggable (punctuation
 * only, or a script with no Latin transliteration). The caller decides what that
 * means — {@link CatalogService} rejects it with a per-field message rather than
 * silently inventing a key.
 */
export function slugify(input: string): string {
  const lowered = input.toLowerCase().trim();

  const transliterated = [...lowered]
    .map((character) => UNDECOMPOSABLE[character] ?? character)
    .join('');

  return (
    transliterated
      .normalize('NFD')
      // Combining diacritical marks, left behind by NFD decomposition.
      .replace(/[̀-ͯ]/g, '')
      // Apostrophes vanish rather than becoming separators: "d'appareils" should
      // slug to "dappareils", not "d-appareils".
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLUG_LENGTH)
      // Trailing hyphen again: the slice above can land mid-separator.
      .replace(/-+$/g, '')
  );
}

/**
 * Appends a numeric suffix until the slug is unique among `taken`.
 *
 * Collisions are real rather than theoretical: "Air conditioning" as a top-level
 * trade and "Air conditioning" as a specialisation under Appliance repair are
 * both reasonable entries an admin might create.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - String(suffix).length - 1)}-${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  // 998 categories sharing one name is not a naming collision, it is a bug or an
  // attack. Failing loudly beats generating an unbounded key.
  throw new Error(`Unable to derive a unique slug from "${base}"`);
}
