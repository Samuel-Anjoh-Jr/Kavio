'use client';

import { useEffect, useRef } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { useInViewOnce } from '@/components/motion/use-in-view-once';

/**
 * Escrow, explained with the same objects the app shows after a booking: the
 * five-state rail (PAY-02: Paid → Accepted → In progress → Completed →
 * Released) and the receipt a client sees before paying.
 *
 * When the rail scrolls into view the states light one after another and the
 * receipt's status flips from "held" to "released" at the end: the money
 * moving is the thing being explained, so the motion follows the money.
 *
 * The receipt mirrors the real fee model (SRS PAY-01, §550): the client pays
 * the agreed quote with nothing added, and the ~10% fee comes out of the
 * worker's payout. Amounts go through next-intl's XAF currency format.
 *
 * The server renders the finished state (all five lit, "released"), which is
 * also what reduced motion and no-JS visitors keep.
 */

const STATES = ['paid', 'accepted', 'inProgress', 'completed', 'released'] as const;

const QUOTE = 45_000;
const FEE_RATE = 0.1;

const STEP_MS = 650;

export function EscrowFlow() {
  const t = useTranslations('Marketing.pricing');
  const format = useFormatter();
  const rootRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const fee = Math.round(QUOTE * FEE_RATE);
  const xaf = (value: number) => format.number(value, 'currency');

  // State lives in data attributes and CSS transitions do the drawing: a node
  // fills when its state is reached, and the segment below it fills once the
  // money has moved on to the next state.
  const apply = (root: HTMLElement, step: number) => {
    root.querySelectorAll<HTMLElement>('[data-escrow-state]').forEach((node, index) => {
      node.dataset.reached = String(index <= step);
      node.dataset.passed = String(index < step);
    });
    root.dataset.released = String(step === STATES.length - 1);
  };

  useInViewOnce(rootRef, {
    threshold: 0.35,
    prepare: (root) => apply(root, 0),
    enter: (root) => {
      for (let step = 1; step < STATES.length; step += 1) {
        timers.current.push(window.setTimeout(() => apply(root, step), step * STEP_MS));
      }
    },
  });

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-released="true"
      className="group/escrow grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-16"
    >
      <ol className="flex flex-col">
        {STATES.map((state, index) => (
          <li
            key={state}
            data-escrow-state
            data-reached="true"
            data-passed={String(index < STATES.length - 1)}
            className="group/state relative grid grid-cols-[2rem_1fr] gap-4 pb-8 last:pb-0"
          >
            {/* The segment to the next state: a track, and a fill that grows
                down it once the money has moved on. None after the last. */}
            {index < STATES.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-[0.9375rem] top-8 w-0.5 overflow-hidden bg-border"
              >
                <span className="block h-full origin-top scale-y-0 bg-primary transition-[scale] duration-500 ease-out group-data-[passed=true]/state:scale-y-100" />
              </span>
            )}
            <span
              aria-hidden="true"
              className="relative z-10 flex size-8 items-center justify-center rounded-full border-2 border-border bg-surface font-numeric text-xs font-semibold text-muted-foreground transition-[background-color,border-color,color,scale] duration-300 group-data-[reached=true]/state:scale-100 group-data-[reached=true]/state:border-primary group-data-[reached=true]/state:bg-primary group-data-[reached=true]/state:text-primary-foreground group-data-[reached=false]/state:scale-90"
            >
              <span className="group-data-[reached=true]/state:hidden">{index + 1}</span>
              <Check className="hidden size-4 group-data-[reached=true]/state:block" />
            </span>
            <div className="flex flex-col gap-1 pt-1">
              <h3 className="font-heading text-base font-semibold text-foreground sm:text-lg">
                {t(`states.${state}.title`)}
              </h3>
              <p className="max-w-md text-muted-foreground">{t(`states.${state}.body`)}</p>
            </div>
          </li>
        ))}
      </ol>

      <aside
        aria-labelledby="escrow-receipt-heading"
        className="flex flex-col gap-5 rounded-card border border-border bg-surface p-6 shadow-md lg:sticky lg:top-24"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3
            id="escrow-receipt-heading"
            className="font-heading text-base font-semibold text-surface-foreground"
          >
            {t('receipt.heading')}
          </h3>
          <span className="text-xs text-muted-foreground">{t('receipt.example')}</span>
        </div>

        <dl className="flex flex-col divide-y divide-dashed divide-border text-sm">
          <ReceiptRow label={t('receipt.quote')} value={xaf(QUOTE)} />
          <ReceiptRow
            label={t('receipt.youPay')}
            note={t('receipt.youPayNote')}
            value={xaf(QUOTE)}
            strong
          />
          <ReceiptRow
            label={t('receipt.fee')}
            note={t('receipt.feeNote')}
            value={`− ${xaf(fee)}`}
          />
          <ReceiptRow label={t('receipt.workerGets')} value={xaf(QUOTE - fee)} strong />
        </dl>

        <div className="flex items-center justify-between gap-3 rounded-input bg-muted px-4 py-3">
          <span className="text-sm text-muted-foreground">{t('receipt.status')}</span>
          {/* Both labels stay in the DOM, stacked in one grid cell, and swap by
              opacity + visibility: the pill never changes width mid-animation,
              and a screen reader only ever finds the visible one. */}
          <span className="grid text-sm font-semibold text-foreground">
            <span className="col-start-1 row-start-1 flex items-center justify-end gap-1.5 transition-[opacity,visibility] duration-300 group-data-[released=true]/escrow:invisible group-data-[released=true]/escrow:opacity-0">
              <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
              {t('receipt.held')}
            </span>
            <span className="col-start-1 row-start-1 flex items-center justify-end gap-1.5 transition-[opacity,visibility] duration-300 group-data-[released=false]/escrow:invisible group-data-[released=false]/escrow:opacity-0">
              <span aria-hidden="true" className="size-2 rounded-full bg-success" />
              {t('receipt.released')}
            </span>
          </span>
        </div>

        <p className="text-xs text-muted-foreground">{t('receipt.methods')}</p>
      </aside>
    </div>
  );
}

function ReceiptRow({
  label,
  note,
  value,
  strong = false,
}: {
  label: string;
  note?: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0">
      <dt className="flex flex-col">
        <span className={strong ? 'font-medium text-surface-foreground' : 'text-muted-foreground'}>
          {label}
        </span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </dt>
      <dd
        className={`whitespace-nowrap font-numeric tabular-nums ${strong ? 'font-semibold text-surface-foreground' : 'text-muted-foreground'}`}
      >
        {value}
      </dd>
    </div>
  );
}
