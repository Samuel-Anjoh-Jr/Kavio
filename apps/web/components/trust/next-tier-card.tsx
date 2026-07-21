'use client';

import { useTranslations } from 'next-intl';
import { Circle } from 'lucide-react';
import { TierBadge } from './tier-badge';
import type { TierStatus } from '@/lib/trust';

/**
 * "What unlocks the next tier" (TRU-02, TRU-04). Leads with the BENEFIT of the
 * next tier and lists the outstanding gates underneath, so the requirements read
 * as a price rather than a rejection.
 *
 * Requirement copy comes from `labelKey` with `required` / `current` passed as
 * values — the API deliberately returns keys, never sentences, so EN/FR parity
 * is enforceable in one catalogue.
 */
export function NextTierCard({ tierStatus }: { tierStatus: TierStatus }) {
  const t = useTranslations('Trust');
  const { nextTier, requirements } = tierStatus;

  if (!nextTier) {
    return (
      <section className="rounded-card border border-border bg-surface p-5 sm:p-6">
        <h2 className="font-heading text-base font-semibold text-foreground">{t('topTier')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('topTierBody')}</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="next-tier-heading"
      className="rounded-card border border-primary/20 bg-primary/5 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="next-tier-heading" className="font-heading text-base font-semibold text-foreground">
          {t('nextTierHeading')}
        </h2>
        <TierBadge tier={nextTier} size="sm" />
      </div>

      <p className="mt-2 text-sm text-foreground">{t(`unlock.${nextTier}`)}</p>

      {requirements.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('requirementsHeading')}
          </h3>
          <ul className="mt-2 space-y-2">
            {requirements.map((requirement) => (
              <li
                key={`${requirement.kind}-${requirement.checkType ?? ''}`}
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <Circle aria-hidden className="mt-1 size-3 shrink-0 text-muted-foreground" />
                {/* Keys are namespaced under Trust.* by the API; this component
                    is already scoped to Trust, so strip the prefix. */}
                {t(requirement.labelKey.replace(/^Trust\./, ''), {
                  required: requirement.required,
                  current: requirement.current,
                })}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
