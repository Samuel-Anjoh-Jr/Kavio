/**
 * Locale-aware date formatting for the transactional surfaces.
 *
 * XAF numbers get IBM Plex via the font stack; dates get the viewer's locale so
 * a Douala user reading French sees "21 juil. 2026, 14:30" and an English one
 * sees "Jul 21, 2026, 2:30 PM" — the same instant, each in its own convention.
 */

function intlLocale(locale: string): string {
  return locale === 'fr' ? 'fr-CM' : 'en-CM';
}

export function formatDateTime(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatDate(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium' }).format(date);
}
