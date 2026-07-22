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

/** Just the clock time — for a chat bubble, where the day is already the header. */
export function formatTime(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(intlLocale(locale), { timeStyle: 'short' }).format(date);
}

/**
 * A day separator label for a thread — "Today" / "Yesterday" / a date. Chat
 * groups by day, and the separator is what stops a long scroll being a wall of
 * bubbles with no anchor in time.
 */
export function formatDayLabel(
  iso: string,
  locale: string,
  labels: { today: string; yesterday: string },
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

  if (dayDiff === 0) return labels.today;
  if (dayDiff === 1) return labels.yesterday;

  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium' }).format(date);
}
