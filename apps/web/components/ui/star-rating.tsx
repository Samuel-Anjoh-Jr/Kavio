import type { StarBreakdown } from '@/lib/graphql/marketing';
import { cn } from '@/lib/utils';

/**
 * Renders a server-computed star row (SRS §26.2).
 *
 * This component does NO rounding. It receives `full` / `half` / `empty` from
 * the API and draws exactly that — which is the entire point of the requirement
 * that ratings are "always computed server-side": one implementation of the
 * maths means the landing page, search results and a worker profile cannot
 * disagree about whether a 4.3 shows a half star.
 *
 * The stars themselves are `aria-hidden`; the row carries one text label. A
 * screen reader user wants "Rated 4.5 out of 5", not five list items each
 * announcing a polygon.
 */

function Star({ fill }: { fill: 'full' | 'half' | 'empty' }) {
  const path =
    'M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.4 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.94L12 2.5z';

  if (fill === 'half') {
    return (
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
        {/* The filled half is the SAME path as a full star, clipped to its left
            side — so a half star is never a slightly different glyph that fails
            to line up with its neighbours. The clip is an inline CSS `inset`
            rather than an SVG <clipPath>, because a clipPath needs an id, and a
            page with nine testimonials would emit that id nine times. */}
        <path d={path} className="fill-none stroke-warning" strokeWidth={1.5} />
        <path d={path} className="fill-warning" style={{ clipPath: 'inset(0 50% 0 0)' }} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        d={path}
        className={fill === 'full' ? 'fill-warning' : 'fill-none stroke-warning/40'}
        strokeWidth={1.5}
      />
    </svg>
  );
}

export function StarRating({
  stars,
  label,
  className,
}: {
  stars: StarBreakdown;
  /** Already-translated, e.g. "Rated 4.5 out of 5". */
  label: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {Array.from({ length: stars.full }, (_, i) => (
        <Star key={`f${i}`} fill="full" />
      ))}
      {stars.half === 1 && <Star fill="half" />}
      {Array.from({ length: stars.empty }, (_, i) => (
        <Star key={`e${i}`} fill="empty" />
      ))}
    </span>
  );
}
