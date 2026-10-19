'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { animate } from 'animejs';
import { useInViewOnce } from '@/components/motion/use-in-view-once';

/**
 * A portfolio before/after card for the horizontal rail (SRS §20.6).
 *
 * The comparison is driven by a real `<input type="range">` rather than a
 * pointer-drag on a div. That is the accessibility decision on this component:
 * a slider built from pointer events is invisible to a keyboard and to a screen
 * reader, whereas a range input arrives with arrow-key operability, a focus
 * ring, and an announced value for free (NFR-A11Y-01). It is styled to look like
 * a handle on the seam; it is still just a slider underneath.
 *
 * Images are plain `<img>` with explicit dimensions and `loading="lazy"` —
 * portfolio media lives on S3-compatible storage under URLs that vary per
 * deployment, and next/image would require allow-listing every one of those
 * hosts. The explicit width/height is what keeps the rail out of the CLS budget
 * (NFR-PERF-01).
 *
 * With `hint`, the handle nudges left and right once when the card first
 * scrolls into view, so a visitor can see it is meant to be dragged before
 * they have to guess. It stops the moment they touch it, and never runs under
 * reduced motion.
 */
export function BeforeAfterCard({
  beforeUrl,
  afterUrl,
  caption,
  trade,
  hint = false,
}: {
  beforeUrl: string;
  afterUrl: string;
  caption: string;
  trade: string;
  hint?: boolean;
}) {
  const t = useTranslations('Marketing.portfolio');
  const [position, setPosition] = useState(50);
  const id = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  useInViewOnce(frameRef, {
    threshold: 0.6,
    enter: () => {
      if (!hint) return;
      const handle = { value: 50 };
      const nudge = animate(handle, {
        value: [
          { to: 30, duration: 450 },
          { to: 66, duration: 600 },
          { to: 50, duration: 450 },
        ],
        delay: 300,
        ease: 'inOutSine',
        onUpdate: () => {
          if (touched.current) {
            nudge.pause();
            return;
          }
          setPosition(Math.round(handle.value));
        },
      });
    },
  });

  const onUserInput = (value: number) => {
    touched.current = true;
    setPosition(value);
  };

  return (
    <figure className="flex w-72 shrink-0 flex-col gap-3 sm:w-80">
      <div
        ref={frameRef}
        onPointerDown={() => {
          touched.current = true;
        }}
        className="relative aspect-4/3 overflow-hidden rounded-image bg-muted"
      >
        {/* Local SVG placeholders (and, in production, storage URLs that vary per
            deployment). next/image would need every storage host allow-listed;
            the explicit dimensions already reserve the box for the CLS budget. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterUrl}
          alt={t('afterAlt', { trade })}
          width={640}
          height={480}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />

        {/* The "before" is clipped to the slider position. `inset` on the right
            means 0% shows all of it and 100% none — the seam follows the handle. */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          aria-hidden="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={beforeUrl}
            alt=""
            width={640}
            height={480}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-surface shadow-md"
          style={{ left: `${position}%` }}
          aria-hidden="true"
        />

        <label htmlFor={id} className="sr-only">
          {t('sliderLabel', { trade })}
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(event) => onUserInput(Number(event.target.value))}
          aria-valuetext={t('sliderValue', { percent: position })}
          className="absolute inset-x-0 bottom-0 h-full w-full cursor-ew-resize appearance-none bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-slider-thumb]:size-8 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:bg-primary"
        />

        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-neutral-900/70 px-2.5 py-1 text-xs font-medium text-neutral-50">
          {t('before')}
        </span>
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-neutral-900/70 px-2.5 py-1 text-xs font-medium text-neutral-50">
          {t('after')}
        </span>
      </div>

      <figcaption className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{trade}</span>
        <span className="text-sm text-muted-foreground">{caption}</span>
      </figcaption>
    </figure>
  );
}
