'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Pause, Play } from 'lucide-react';
import { StarRating } from '@/components/ui/star-rating';
import { useReducedMotion } from '@/lib/motion';
import { localised, type TestimonialEntry } from '@/lib/graphql/marketing';

/**
 * The infinite testimonial marquee (SRS §26.2: "infinite marquee (pause on
 * hover, drag, edge fade)", seeded with at least 8 entries).
 *
 * The track is rendered TWICE and translated by exactly half its width before
 * wrapping, which is what makes the loop seamless — the second copy is already
 * on screen when the first scrolls off, so there is no visible jump and no
 * moment where the row is empty. The duplicate is `aria-hidden`, so a screen
 * reader hears each testimonial once.
 *
 * Motion is driven by a rAF loop over a transform rather than a CSS animation,
 * because the requirement includes DRAG: a CSS keyframe cannot be scrubbed by a
 * pointer and then resumed from where the user left it.
 *
 * A visible pause/play button sits under the row (WCAG 2.2.2: anything that
 * moves on its own for more than five seconds needs a way to stop it that is
 * not hover, which touch screens do not have).
 *
 * Under prefers-reduced-motion it does not animate at all. It becomes an
 * ordinary horizontally scrollable row — still complete, still readable, still
 * operable by keyboard and touch, just not moving on its own.
 */
export function TestimonialMarquee({ testimonials }: { testimonials: TestimonialEntry[] }) {
  const t = useTranslations('Marketing.testimonials');
  const locale = useLocale();
  const reducedMotion = useReducedMotion();

  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);
  const userPausedRef = useRef(false);
  const [userPaused, setUserPaused] = useState(false);
  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const setPaused = useCallback((value: boolean) => {
    pausedRef.current = value;
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    const track = trackRef.current;
    if (!track) return;

    let frame = 0;
    let last = performance.now();
    const SPEED = 32; // px per second — slow enough to actually read a card.

    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;

      if (!pausedRef.current && !userPausedRef.current && !dragRef.current) {
        offsetRef.current -= SPEED * delta;
      }

      // Half the scroll width is one full copy of the list; wrapping there
      // rather than at the end is what hides the seam.
      const half = track.scrollWidth / 2;
      if (half > 0) {
        if (offsetRef.current <= -half) offsetRef.current += half;
        if (offsetRef.current > 0) offsetRef.current -= half;
      }

      track.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (reducedMotion) return;
    dragRef.current = { startX: event.clientX, startOffset: offsetRef.current };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    offsetRef.current = drag.startOffset + (event.clientX - drag.startX);
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const toggleUserPaused = () => {
    userPausedRef.current = !userPausedRef.current;
    setUserPaused(userPausedRef.current);
  };

  if (testimonials.length === 0) return null;

  const cards = (hidden: boolean) =>
    testimonials.map((testimonial) => (
      <TestimonialCard
        key={`${hidden ? 'dup' : 'src'}-${testimonial.id}`}
        testimonial={testimonial}
        locale={locale}
        ratingLabel={t('ratingLabel', { rating: testimonial.stars.rounded })}
        hidden={hidden}
      />
    ));

  return (
    <div className="flex flex-col gap-4">
      <div
        // The edge fade, per the requirement. A mask rather than gradient overlays
        // so it works over any section background without a colour to match.
        // `overflow-hidden` is load-bearing, not cosmetic: the track below is
        // `w-max` (its natural width, every card side by side) so the transform
        // loop has room to run — without a clipping ancestor, that multi-thousand
        // -pixel track becomes the page's intrinsic width and forces mobile
        // browsers to zoom the entire layout out to fit it.
        className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        // Keyboard users get the same courtesy as mouse users: focusing a card
        // inside the row stops it sliding out from under them.
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <div
          className={
            reducedMotion
              ? 'flex gap-4 overflow-x-auto pb-2'
              : dragging
                ? 'flex w-max cursor-grabbing gap-4 select-none'
                : 'flex w-max cursor-grab gap-4'
          }
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {cards(false)}
          {/* The seamless second lap. Hidden from assistive tech and from the tab
            order — the same quotes twice would be a bug, not a feature. */}
          {!reducedMotion && cards(true)}
        </div>
      </div>

      {!reducedMotion && (
        <div className="mx-auto flex w-full max-w-6xl justify-end px-4 sm:px-6">
          <button
            type="button"
            onClick={toggleUserPaused}
            className="inline-flex items-center gap-2 rounded-button px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {userPaused ? (
              <Play aria-hidden="true" className="size-4" />
            ) : (
              <Pause aria-hidden="true" className="size-4" />
            )}
            {userPaused ? t('play') : t('pause')}
          </button>
        </div>
      )}
    </div>
  );
}

function TestimonialCard({
  testimonial,
  locale,
  ratingLabel,
  hidden,
}: {
  testimonial: TestimonialEntry;
  locale: string;
  ratingLabel: string;
  hidden: boolean;
}) {
  const content = localised(testimonial, 'content', locale);
  const role = localised(testimonial, 'role', locale);
  const initials = testimonial.author
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');

  return (
    <figure
      // Fixed width, per the requirement: cards that size to their content make
      // the marquee speed feel inconsistent as longer quotes pass by.
      className="flex w-80 shrink-0 flex-col gap-4 rounded-card bg-surface p-6 shadow-sm"
      aria-hidden={hidden || undefined}
      inert={hidden}
    >
      <StarRating stars={testimonial.stars} label={ratingLabel} />

      {/* line-clamp, per the requirement — an over-long quote must not make one
          card twice the height of its neighbours. */}
      <blockquote className="line-clamp-5 text-sm leading-relaxed text-surface-foreground">
        {content}
      </blockquote>

      <figcaption className="mt-auto flex items-center gap-3">
        {testimonial.avatarUrl ? (
          // Admin-supplied absolute URL from arbitrary storage; next/image would
          // need every such host allow-listed in next.config, and this is a 40px
          // avatar — the optimiser would cost more than it saves.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={testimonial.avatarUrl}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            decoding="async"
            className="size-10 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-full bg-primary/10 font-medium text-primary"
          >
            {initials}
          </span>
        )}
        <span className="flex flex-col">
          <span className="text-sm font-medium text-surface-foreground">{testimonial.author}</span>
          <span className="text-xs text-muted-foreground">{role}</span>
        </span>
      </figcaption>
    </figure>
  );
}
