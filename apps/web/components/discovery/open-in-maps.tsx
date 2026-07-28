'use client';

import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "Open in maps" for a job or a worker's working area.
 *
 * ── Why a place NAME and not the pin ────────────────────────────────────────
 *
 * The link is built from the reverse-geocoded quarter, town and landmark rather
 * than from latitude/longitude, and the coordinates are deliberately not exposed
 * on the public read at all. A job's pin is very often somebody's home, and the
 * board is browsable by anyone with no account — publishing exact coordinates
 * there would turn a marketplace into an address directory. "Akwa, Douala,
 * Cameroon" gets a visitor to the right neighbourhood, which is all a stranger
 * deciding whether to quote actually needs.
 *
 * A `geo:` URI would open the native app on Android but does nothing useful on
 * desktop, so this uses the universal Google Maps search URL, which every
 * platform resolves — including handing off to the installed app on mobile.
 */
export function OpenInMaps({
  area,
  city,
  landmark,
  className,
}: {
  area?: string | null;
  city?: string | null;
  landmark?: string | null;
  className?: string;
}) {
  const t = useTranslations('Location');

  // Most specific first, so the query lands on the landmark when there is one.
  const parts = [landmark, area, city, 'Cameroon'].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0,
  );

  // Nothing to point at. Rendering a dead "open in maps" would be worse than
  // rendering nothing — it promises a location the job never had.
  if (parts.length <= 1) {
    return null;
  }

  const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-button text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <MapPin aria-hidden className="size-4" />
      {t('openInMaps')}
    </a>
  );
}
