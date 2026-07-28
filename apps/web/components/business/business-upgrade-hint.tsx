'use client';

import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Building2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import {
  JOB_POSTING_ELIGIBILITY_QUERY,
  type JobPostingEligibilityResult,
} from '@/lib/graphql/jobs';

/**
 * "Are you a business?" — the on-ramp to the job board (JOB-01, BIZ-01).
 *
 * Someone browsing for workers is, quite often, a company that would rather post
 * one vacancy than contact fifteen people. They have no way to discover that
 * posting exists, because the gate only speaks when you have already tried to
 * publish — which is far too late to be an invitation.
 *
 * It hides itself the moment the identity CAN post, so a verified business is
 * never advertised its own status back at it.
 */
export function BusinessUpgradeHint() {
  const t = useTranslations('BusinessUpgradeHint');
  const { data } = useQuery<JobPostingEligibilityResult>(JOB_POSTING_ELIGIBILITY_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  const eligibility = data?.jobPostingEligibility;
  if (!eligibility || eligibility.allowed) {
    return null;
  }

  return (
    <section className="mt-8 rounded-card border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-primary/10 p-2 text-primary">
            <Building2 aria-hidden className="size-5" />
          </span>
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground">{t('heading')}</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t('body')}</p>
          </div>
        </div>

        <Button asChild variant="outline">
          <Link href="/app/onboarding/business">
            {t('cta')}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  );
}
