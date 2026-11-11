'use client';

import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ChevronRight, Circle, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ME_QUERY, type MeQueryResult } from '@/lib/graphql/documents';
import { EMERGENCY_CONTACTS_QUERY } from '@/lib/graphql/safety';
import { trustNudges } from '@/lib/notification-hub';

/**
 * The full trust & safety checklist with an N/N score, at the top of the
 * Safety Center: every step listed, done ones ticked, open ones linked.
 */
export function SafetyChecklist() {
  const t = useTranslations('Notifications.hub');
  const tSafety = useTranslations('Safety');
  const { data: meData } = useQuery<MeQueryResult>(ME_QUERY, { fetchPolicy: 'cache-first' });
  const { data: contactsData } = useQuery<{ myEmergencyContacts: Array<{ id: string }> }>(
    EMERGENCY_CONTACTS_QUERY,
    { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
  );
  const steps = trustNudges(meData?.me, (contactsData?.myEmergencyContacts?.length ?? 0) > 0);
  if (steps.length === 0) return null;
  const done = steps.filter((s) => s.done).length;
  const complete = done === steps.length;

  return (
    <section
      aria-labelledby="safety-checklist"
      className="rounded-card border border-border bg-surface p-4"
    >
      <div className="mb-3 flex items-center gap-3">
        <ShieldCheck
          aria-hidden
          className={complete ? 'size-5 text-success' : 'size-5 text-primary'}
        />
        <h2 id="safety-checklist" className="flex-1 text-sm font-semibold text-foreground">
          {complete ? tSafety('checklistComplete') : t('nudgesTitle')}
        </h2>
        <span className="font-numeric text-sm font-semibold text-muted-foreground">
          {done}/{steps.length}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {steps.map((step) =>
          step.done ? (
            <li key={step.id} className="flex items-center gap-3 py-2.5">
              <CheckCircle2 aria-hidden className="size-5 shrink-0 text-success" />
              <span className="text-sm text-muted-foreground">{t(`nudges.${step.id}.title`)}</span>
            </li>
          ) : (
            <li key={step.id}>
              <Link
                href={step.href}
                className="flex items-center gap-3 rounded-input py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Circle aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {t(`nudges.${step.id}.title`)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`nudges.${step.id}.body`)}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
