import { useFormatter, useTranslations } from 'next-intl';
import { BadgeCheck, MapPin, ShieldCheck } from 'lucide-react';
import { cssVars } from '@/lib/utils';

/**
 * The Trust Record, the landing page's signature element (DESIGN.md).
 *
 * An EXAMPLE worker record, labelled as one on the card itself: a Trust Score
 * ring, the four Trust Engine pillars as bars, and the verification stamps
 * that earned them. It replaces illustrated portraits because the record is
 * the product: a visitor should meet the thing they will actually check before
 * hiring, not a drawing of a person.
 *
 * A server component with no client JS. Its entrance (ring sweep, count, bar
 * fills, stamps landing) is CSS keyframes from globals.css that start at first
 * paint, so on a slow phone the hero never waits on hydration, and the markup
 * already holds every final value for a crawler or a no-JS visitor.
 */

const SCORE = 82;

/** Pillar sub-scores for the example; their mean is the score above. */
const PILLARS = [
  { key: 'identity', value: 96 },
  { key: 'work', value: 84 },
  { key: 'record', value: 78 },
  { key: 'payments', value: 70 },
] as const;

const STAMPS = [
  { key: 'id', rotate: '-3deg' },
  { key: 'address', rotate: '2deg' },
  { key: 'jobs', rotate: '-1.5deg' },
] as const;

const JOBS_PAID_OUT = 41;
const HELD_AMOUNT = 45_000;

const RING_SIZE = 112;
const RING_STROKE = 9;

export function TrustRecord() {
  const t = useTranslations('Marketing.hero.record');
  const format = useFormatter();

  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - SCORE / 100);

  return (
    <figure aria-label={t('label')} className="relative mx-auto w-full max-w-[26rem]">
      {/* A second sheet under the record: depth from paper, not from a glow. */}
      <div
        aria-hidden="true"
        className="kv-enter absolute inset-0 translate-x-3 translate-y-3 rotate-[1.5deg] rounded-card border border-border bg-muted"
        style={cssVars({ '--kv-delay': '80ms' })}
      />

      <div
        className="kv-enter relative flex flex-col gap-5 rounded-card border border-border bg-surface p-5 shadow-lg sm:p-6"
        style={cssVars({ '--kv-delay': '150ms' })}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">{t('example')}</span>
          <span className="rounded-button border border-primary/30 px-2 py-0.5 font-numeric text-xs font-semibold text-primary">
            {t('tier')}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm font-semibold text-primary"
          >
            EM
          </span>
          <div className="min-w-0">
            <p className="font-heading text-base font-semibold text-surface-foreground">
              {t('name')}
            </p>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{t('trade')}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden="true">
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={radius}
                fill="none"
                strokeWidth={RING_STROKE}
                className="stroke-border"
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={radius}
                fill="none"
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                className="kv-sweep stroke-primary"
                style={{
                  strokeDasharray: circumference,
                  ...cssVars({
                    '--kv-sweep-from': circumference,
                    '--kv-sweep-to': offset,
                    '--kv-delay': '350ms',
                  }),
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="sr-only">{t('scoreLabel', { score: SCORE })}</span>
              <span
                aria-hidden="true"
                className="kv-count font-numeric text-3xl font-semibold tabular-nums text-surface-foreground"
                style={cssVars({ '--kv-count': SCORE, '--kv-delay': '350ms' })}
              />
              <span aria-hidden="true" className="text-[0.6875rem] text-muted-foreground">
                {t('scoreCaption')}
              </span>
            </div>
          </div>

          <dl className="flex min-w-0 flex-1 flex-col gap-2.5">
            {PILLARS.map((pillar, index) => (
              <div key={pillar.key}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <dt className="truncate text-muted-foreground">{t(`pillars.${pillar.key}`)}</dt>
                  <dd className="font-numeric font-medium tabular-nums text-surface-foreground">
                    {pillar.value}
                  </dd>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="kv-fill h-full bg-primary"
                    style={{
                      transform: `scaleX(${pillar.value / 100})`,
                      ...cssVars({ '--kv-delay': `${550 + index * 60}ms` }),
                    }}
                  />
                </div>
              </div>
            ))}
          </dl>
        </div>

        <ul className="flex flex-wrap gap-2">
          {STAMPS.map((stamp, index) => (
            <li
              key={stamp.key}
              className="kv-stamp inline-flex items-center gap-1.5 rounded-button border border-success/50 bg-success/10 px-2.5 py-1 text-xs font-semibold text-surface-foreground"
              style={cssVars({
                '--kv-stamp-rot': stamp.rotate,
                '--kv-delay': `${1050 + index * 140}ms`,
              })}
            >
              <BadgeCheck aria-hidden="true" className="size-3.5 text-success" />
              {t(`stamps.${stamp.key}`, { count: JOBS_PAID_OUT })}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">{t('escrowLabel')}</span>
          <span className="flex items-center gap-1.5 font-numeric text-sm font-semibold tabular-nums text-surface-foreground">
            <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
            {format.number(HELD_AMOUNT, 'currency')}
          </span>
        </div>
      </div>
    </figure>
  );
}
