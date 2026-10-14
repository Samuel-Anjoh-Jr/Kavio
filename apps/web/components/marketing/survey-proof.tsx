'use client';

import { useRef } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { animate } from 'animejs';
import { countUp, motionDuration } from '@/lib/motion';
import { useInViewOnce } from '@/components/motion/use-in-view-once';

/**
 * The page's one count-up group (DESIGN.md "Proof and numbers").
 *
 * These are the survey results the product was designed from (SRS §1.3), with
 * the source printed under them. They replace platform totals that had no
 * source behind them: a pre-scale marketplace that shows "15,000+ verified"
 * before the API can back it up is spending the one thing it sells, which is
 * being checkable.
 *
 * The server renders the final percentages; the count and the bars only
 * animate once the list scrolls into view.
 */

/** Share of the 27 respondents who picked each feature (SRS §1.3). */
export const SURVEY_RESULTS = [
  { key: 'portfolio', respondents: 16 },
  { key: 'identity', respondents: 16 },
  { key: 'quote', respondents: 14 },
  { key: 'escrow', respondents: 12 },
] as const;

const RESPONDENTS = 27;

export function SurveyProof() {
  const t = useTranslations('Marketing.proof');
  const format = useFormatter();
  const ref = useRef<HTMLOListElement>(null);

  const percent = (share: number) => format.number(share, { style: 'percent' });

  useInViewOnce(ref, {
    threshold: 0.3,
    prepare: (el) => {
      el.querySelectorAll<HTMLElement>('[data-bar]').forEach((bar) => {
        bar.style.transform = 'scaleX(0)';
      });
      el.querySelectorAll<HTMLElement>('[data-count]').forEach((count) => {
        count.textContent = percent(0);
      });
    },
    enter: (el) => {
      el.querySelectorAll<HTMLElement>('[data-bar]').forEach((bar, index) => {
        animate(bar, {
          scaleX: Number(bar.dataset.bar),
          duration: motionDuration(900),
          delay: motionDuration(index * 60),
          ease: 'outExpo',
        });
      });
      el.querySelectorAll<HTMLElement>('[data-count]').forEach((count) => {
        countUp(count, {
          to: Number(count.dataset.count),
          duration: 1_100,
          format: (value) => percent(value),
        });
      });
    },
  });

  return (
    <ol ref={ref} className="flex flex-col divide-y divide-border border-y border-border">
      {SURVEY_RESULTS.map((item) => {
        const share = item.respondents / RESPONDENTS;
        const label = t(`items.${item.key}`);
        return (
          <li
            key={item.key}
            className="grid grid-cols-[5.5rem_1fr] items-center gap-4 py-5 sm:grid-cols-[7rem_1fr]"
          >
            <span className="sr-only">{t('valueLabel', { percent: percent(share), label })}</span>
            <span
              aria-hidden="true"
              data-count={share}
              className="font-numeric text-3xl font-semibold tabular-nums text-foreground sm:text-4xl"
            >
              {percent(share)}
            </span>
            <div aria-hidden="true" className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground sm:text-base">{label}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  data-bar={share}
                  className="h-full origin-left bg-primary"
                  style={{ transform: `scaleX(${share})` }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
