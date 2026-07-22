'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { REVIEW_RATING_MAX, REVIEW_RATING_MIN } from '@/lib/reviews';
import { cn } from '@/lib/utils';

const SIZE_CLASS = {
  sm: 'size-3.5',
  md: 'size-5',
  lg: 'size-9',
} as const;

/**
 * A read-only row of stars.
 *
 * Rendered as a single `img`-role element with one text label rather than five
 * icons: a screen reader should hear "4 out of 5 stars", not "star, star, star,
 * star, star". The icons themselves are decorative and hidden.
 */
export function StarRatingDisplay({
  rating,
  size = 'md',
  className,
}: {
  rating: number;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  const t = useTranslations('Reviews');

  return (
    <span
      role="img"
      aria-label={t('starsAria', { rating, max: REVIEW_RATING_MAX })}
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {Array.from({ length: REVIEW_RATING_MAX }, (_, index) => index + 1).map((value) => (
        <Star
          key={value}
          aria-hidden
          className={cn(
            SIZE_CLASS[size],
            value <= rating ? 'fill-warning text-warning' : 'fill-none text-border',
          )}
        />
      ))}
    </span>
  );
}

/**
 * The star INPUT for leaving a review (REV-01).
 *
 * Built as a radio group, not five buttons: a rating is one choice among five,
 * and the radio semantics give arrow-key navigation and a single tab stop for
 * free — which is what a keyboard user expects. The visible stars are labels,
 * so a pointer user clicks a star while the real control underneath stays a
 * standards-compliant input.
 *
 * Hover preview is deliberately visual-only and never changes `value`; on touch
 * there is no hover, and a rating that "sticks" on the way past a star is the
 * classic way these widgets record the wrong number.
 */
export function StarRatingInput({
  value,
  onChange,
  disabled,
  name = 'rating',
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
  name?: string;
}) {
  const t = useTranslations('Reviews');
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value;

  return (
    <div
      role="radiogroup"
      aria-label={t('ratingLabel')}
      className="inline-flex items-center gap-1"
      onMouseLeave={() => setHovered(null)}
    >
      {Array.from(
        { length: REVIEW_RATING_MAX - REVIEW_RATING_MIN + 1 },
        (_, index) => index + REVIEW_RATING_MIN,
      ).map((star) => (
        <label
          key={star}
          onMouseEnter={() => !disabled && setHovered(star)}
          className={cn(
            'cursor-pointer rounded-md p-1 transition-transform focus-within:ring-2 focus-within:ring-ring focus-within:outline-none',
            'motion-safe:hover:scale-110',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          <input
            type="radio"
            name={name}
            value={star}
            checked={value === star}
            disabled={disabled}
            onChange={() => onChange(star)}
            className="sr-only"
          />
          <span className="sr-only">{t('starsOption', { rating: star })}</span>
          <Star
            aria-hidden
            className={cn(
              SIZE_CLASS.lg,
              star <= shown ? 'fill-warning text-warning' : 'fill-none text-border',
            )}
          />
        </label>
      ))}
    </div>
  );
}
