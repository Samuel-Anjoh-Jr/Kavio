'use client';

import { useId, useState } from 'react';
import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import type { BreakdownSlice, TimePoint } from '@/lib/graphql/admin';

/**
 * Chart primitives for the admin console (ADM-01, ADM-07).
 *
 * Inline SVG rather than a charting library: these are simple forms, the console
 * is used on Cameroonian connections, and a 200 kB chart bundle to draw a line
 * is a cost the operator pays on every load.
 *
 * ── Colour ─────────────────────────────────────────────────────────────────
 * Every chart here is SINGLE-SERIES, so there is no categorical palette and no
 * adjacent-hue problem to validate: magnitude gets one hue (TMDS primary),
 * light-to-dark, which is the sequential rule. Status tones (warning, danger)
 * appear only where the value genuinely is a status, never as "series two".
 *
 * ── Marks ──────────────────────────────────────────────────────────────────
 * Thin marks, 2px lines, rounded data-ends, recessive grid and axes, and no
 * number printed on every point — the axis and the hover layer carry the values.
 * Growth is drawn as an area under the line so an empty day reads as the zero it
 * is rather than as a gap the eye bridges.
 */

const CHART_HEIGHT = 160;
const CHART_WIDTH = 640;
const PADDING = { top: 8, right: 8, bottom: 20, left: 8 };

export function TimeSeriesChart({
  points,
  label,
  format,
  className,
}: {
  points: TimePoint[];
  /** Names the series. With one series a legend box would be noise. */
  label: string;
  format?: (value: number) => string;
  className?: string;
}) {
  const locale = useLocale();
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className={cn('py-10 text-center text-sm text-muted-foreground', className)}>{label}</p>
    );
  }

  const max = Math.max(...points.map((point) => point.value), 1);
  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const x = (index: number) =>
    PADDING.left +
    (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const y = (value: number) => PADDING.top + innerHeight - (value / max) * innerHeight;

  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const area = `${PADDING.left},${PADDING.top + innerHeight} ${line} ${x(points.length - 1)},${PADDING.top + innerHeight}`;

  const active = hovered === null ? null : (points[hovered] ?? null);
  const formatValue = format ?? ((value: number) => value.toLocaleString(localeTag(locale)));

  // Narrowed once rather than at each use: the early return above guarantees the
  // array is non-empty, but the index signature does not carry that.
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive baseline. No horizontal gridlines: at this size they add
            more ink than information. */}
        <line
          x1={PADDING.left}
          y1={PADDING.top + innerHeight}
          x2={CHART_WIDTH - PADDING.right}
          y2={PADDING.top + innerHeight}
          className="stroke-border"
          strokeWidth={1}
        />

        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {active && hovered !== null && (
          <>
            <line
              x1={x(hovered)}
              y1={PADDING.top}
              x2={x(hovered)}
              y2={PADDING.top + innerHeight}
              className="stroke-border"
              strokeWidth={1}
            />
            {/* 2px surface ring so the marker stays legible over the area fill. */}
            <circle
              cx={x(hovered)}
              cy={y(active.value)}
              r={5}
              className="fill-primary stroke-surface"
              strokeWidth={2}
            />
          </>
        )}

        {/* Hit targets are full-height columns, far bigger than the marks —
            a 2px line is not a pointer target on any device. */}
        {points.map((point, index) => (
          <rect
            key={point.bucket}
            x={x(index) - innerWidth / points.length / 2}
            y={PADDING.top}
            width={innerWidth / points.length}
            height={innerHeight}
            fill="transparent"
            onMouseEnter={() => setHovered(index)}
          />
        ))}
      </svg>

      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{first ? formatBucket(first.bucket, locale) : ''}</span>
        <span>{last ? formatBucket(last.bucket, locale) : ''}</span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
        {active
          ? `${formatBucket(active.bucket, locale)} · ${formatValue(active.value)}`
          : `${label} · ${formatValue(points.reduce((sum, point) => sum + point.value, 0))}`}
      </p>
    </div>
  );
}

/**
 * A horizontal bar breakdown.
 *
 * Horizontal because the labels are category names of unpredictable length —
 * vertical bars would either truncate them or rotate them 45°, both of which
 * make a reader work to answer "which category is this".
 */
export function BarBreakdown({
  slices,
  emptyLabel,
  format,
  max = 8,
}: {
  slices: BreakdownSlice[];
  emptyLabel: string;
  format?: (value: number) => string;
  max?: number;
}) {
  const locale = useLocale();
  const formatValue = format ?? ((value: number) => value.toLocaleString(localeTag(locale)));

  if (slices.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const shown = slices.slice(0, max);
  const peak = Math.max(...shown.map((slice) => slice.value), 1);

  return (
    <ul className="flex flex-col gap-2.5">
      {shown.map((slice) => (
        <li key={`${slice.id ?? slice.label}`} className="flex items-center gap-3">
          <span
            className="w-28 shrink-0 truncate text-xs text-muted-foreground"
            title={slice.label}
          >
            {slice.label}
          </span>
          <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.max((slice.value / peak) * 100, 1)}%` }}
            />
          </span>
          <span className="w-20 shrink-0 text-right font-numeric text-xs text-foreground">
            {formatValue(slice.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A headline KPI with its movement (ADM-01).
 *
 * A NULL delta renders as "no comparison", never as 0% and never as a green
 * arrow. The API returns null precisely when the previous window was empty, and
 * a platform's first month should not display spectacular growth against nothing.
 */
export function KpiTile({
  label,
  value,
  delta,
  noComparisonLabel,
}: {
  label: string;
  value: string;
  delta: number | null;
  noComparisonLabel: string;
}) {
  const locale = useLocale();

  const deltaText =
    delta === null
      ? noComparisonLabel
      : new Intl.NumberFormat(localeTag(locale), {
          style: 'percent',
          maximumFractionDigits: 1,
          signDisplay: 'exceptZero',
        }).format(delta);

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-numeric text-2xl font-semibold text-foreground">{value}</p>
      <p
        className={cn(
          'mt-1 text-xs',
          delta === null
            ? 'text-muted-foreground'
            : delta > 0
              ? 'text-success'
              : delta < 0
                ? 'text-danger'
                : 'text-muted-foreground',
        )}
      >
        {deltaText}
      </p>
    </div>
  );
}

function localeTag(locale: string): string {
  return locale === 'fr' ? 'fr-CM' : 'en-CM';
}

function formatBucket(bucket: string, locale: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: 'numeric',
    month: 'short',
  }).format(new Date(bucket));
}
