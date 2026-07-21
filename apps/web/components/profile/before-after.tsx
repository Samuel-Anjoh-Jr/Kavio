'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RemoteImage } from '@/components/ui/remote-image';

/**
 * The before/after comparison (PRO-02).
 *
 * Portfolio evidence is the single strongest hiring driver in the user survey
 * (59.3%), and a before/after pair is the strongest form of it: it shows the
 * change, not just the result.
 *
 * Built on a range input rather than a drag handler. That is not a shortcut —
 * it is the only version that works with a keyboard and a screen reader, it
 * gives touch users the OS's own hit-target handling for free, and the whole
 * interaction reduces to one number. The wipe is a clip-path on a stacked
 * image, which the compositor handles without a repaint.
 */
export function BeforeAfter({
  before,
  after,
  caption,
}: {
  before: { url: string; caption: string | null };
  after: { url: string; caption: string | null };
  caption?: string | null;
}) {
  const t = useTranslations('Profile');
  const sliderId = useId();
  const [position, setPosition] = useState(50);

  return (
    <figure className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-image bg-muted">
        <RemoteImage
          src={after.url}
          alt={after.caption ?? t('afterAlt')}
          className="absolute inset-0 size-full object-cover"
        />

        <RemoteImage
          src={before.url}
          alt={before.caption ?? t('beforeAlt')}
          className="absolute inset-0 size-full object-cover"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        />

        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          value={position}
          aria-label={t('comparisonLabel')}
          aria-valuetext={t('comparisonValue', { percent: String(position) })}
          onChange={(event) => setPosition(Number(event.target.value))}
          className="peer absolute inset-0 size-full cursor-ew-resize appearance-none bg-transparent opacity-0"
        />

        {/* The visible handle. The input itself is transparent so the images
            show through, which means the focus ring has to live here — a
            control you can reach with Tab but cannot see is not keyboard
            accessible, it just passes the tab-order check. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 flex w-0.5 items-center justify-center bg-surface shadow-lg peer-focus-visible:w-1 peer-focus-visible:bg-ring"
          style={{ left: `${position}%` }}
        >
          <span className="size-8 rounded-full border-2 border-surface bg-surface/90 shadow-md peer-focus-visible:border-ring" />
        </span>

        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-3 rounded-full bg-neutral-900/70 px-2 py-1 text-xs font-medium text-neutral-50"
        >
          {t('before')}
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-3 rounded-full bg-neutral-900/70 px-2 py-1 text-xs font-medium text-neutral-50"
        >
          {t('after')}
        </span>
      </div>

      {caption && <figcaption className="text-sm text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}
