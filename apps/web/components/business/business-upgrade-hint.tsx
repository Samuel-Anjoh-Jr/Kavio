'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Building2, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from '@/i18n/navigation';
import type { SessionTokens } from '@/lib/auth-api';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import {
  JOB_POSTING_ELIGIBILITY_QUERY,
  type JobPostingEligibilityResult,
} from '@/lib/graphql/jobs';
import { restPost } from '@/lib/rest-api';

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
 *
 * The CTA grants the BUSINESS role (POST /auth/roles) before navigating —
 * linking straight to /app/onboarding/business without it sent someone who
 * does not hold that role yet into a server redirect straight back to this
 * same screen, which read as the button just reloading the page.
 */
export function BusinessUpgradeHint() {
  const t = useTranslations('BusinessUpgradeHint');
  const translateError = useAuthErrorMessage();
  const { update } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [starting, setStarting] = useState(false);

  const { data } = useQuery<JobPostingEligibilityResult>(JOB_POSTING_ELIGIBILITY_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  const eligibility = data?.jobPostingEligibility;
  if (!eligibility || eligibility.allowed) {
    return null;
  }

  async function start() {
    setStarting(true);
    try {
      const tokens = await restPost<SessionTokens>('auth/roles', { role: 'BUSINESS' });
      // Hands the pair this call already minted straight to the jwt callback
      // (see auth.ts) — the onboarding page's server-side role check reads
      // this, and discarding the pair to refresh the old one instead is what
      // let a role switch race its own DB write (see RoleSwitcher).
      await update({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      });
      router.push('/app/onboarding/business');
    } catch (error) {
      toast({ variant: 'danger', title: translateError(error) });
      setStarting(false);
    }
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

        <Button variant="outline" disabled={starting} onClick={() => void start()}>
          {starting ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {t('cta')}
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </section>
  );
}
