import { MAX_SLUG_LENGTH, slugify, uniqueSlug } from './slug.util';

describe('slugify', () => {
  it('lowercases and hyphenates a plain trade name', () => {
    expect(slugify('Air conditioning')).toBe('air-conditioning');
  });

  it('strips French accents rather than percent-encoding them', () => {
    // The reason this matters: an accented slug arrives as
    // "%C3%89lectricit%C3%A9" in a shared link and is routinely mangled by chat
    // apps before it reaches the person it was sent to.
    expect(slugify('Électricité')).toBe('electricite');
    expect(slugify('Maçonnerie')).toBe('maconnerie');
    expect(slugify('Déménagement')).toBe('demenagement');
  });

  it('handles ligatures that have no combining form to decompose', () => {
    expect(slugify('Cœur')).toBe('coeur');
    expect(slugify('Æther')).toBe('aether');
  });

  it('drops apostrophes instead of turning them into separators', () => {
    expect(slugify('Réparation d’appareils')).toBe('reparation-dappareils');
    expect(slugify("Plomberie d'urgence")).toBe('plomberie-durgence');
  });

  it('collapses runs of punctuation and whitespace into one hyphen', () => {
    expect(slugify('Moving  &  haulage')).toBe('moving-haulage');
    expect(slugify('IT / computer  support')).toBe('it-computer-support');
  });

  it('never leaves a leading or trailing hyphen', () => {
    expect(slugify('  --Painting--  ')).toBe('painting');
    expect(slugify('& Welding &')).toBe('welding');
  });

  it('truncates without leaving a dangling separator', () => {
    const slug = slugify('a'.repeat(MAX_SLUG_LENGTH - 1) + ' ' + 'b'.repeat(20));

    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('returns empty for input with nothing sluggable, rather than inventing a key', () => {
    // The service turns this into a per-field validation error. Silently
    // producing something like "category-1" would give the admin a key they
    // never chose and cannot predict.
    expect(slugify('!!!')).toBe('');
    expect(slugify('   ')).toBe('');
  });
});

describe('uniqueSlug', () => {
  it('returns the base slug when nothing has claimed it', () => {
    expect(uniqueSlug('plumbing', new Set())).toBe('plumbing');
  });

  it('suffixes on collision', () => {
    expect(uniqueSlug('plumbing', new Set(['plumbing']))).toBe('plumbing-2');
    expect(uniqueSlug('plumbing', new Set(['plumbing', 'plumbing-2']))).toBe('plumbing-3');
  });

  it('keeps the suffixed slug within the length limit', () => {
    const base = 'a'.repeat(MAX_SLUG_LENGTH);
    const result = uniqueSlug(base, new Set([base]));

    expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(result.endsWith('-2')).toBe(true);
  });

  it('throws rather than looping forever on absurd collision counts', () => {
    const taken = new Set(['x', ...Array.from({ length: 1000 }, (_, i) => `x-${i + 2}`)]);

    expect(() => uniqueSlug('x', taken)).toThrow(/unique slug/i);
  });
});
