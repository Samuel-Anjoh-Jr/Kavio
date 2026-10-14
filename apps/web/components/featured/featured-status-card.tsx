'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Pause, Play, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { formatDate } from '@/lib/datetime';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { restPost } from '@/lib/rest-api';
import { MY_FEATURED_STATUS_QUERY, type MyFeaturedStatusResult } from '@/lib/graphql/featured';

/**
 * The worker/business "get featured" pitch and status card (sponsored ranking
 * placement).
 *
 * Unlike WorkerVerificationBanner or BusinessUpgradeHint, this card does NOT
 * hide itself once a listing exists — its whole job is to keep surfacing
 * status (pending / approved / paused / rejected / revoked), so an identity
 * paying extra commission always has somewhere to check on it and step back
 * from it. It hides only while the read has not resolved.
 */
export function FeaturedStatusCard() {
  const t = useTranslations('FeaturedStatusCard');
  const locale = useLocale();
  const translateError = useAuthErrorMessage();
  const { data: session } = useSession();
  const { toast } = useToast();
  const [working, setWorking] = useState(false);

  const { data, refetch } = useQuery<MyFeaturedStatusResult>(MY_FEATURED_STATUS_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  const userId = session?.user?.id ?? null;
  const listing = data?.myFeaturedStatus;

  // Nothing to say until the read has landed at least once.
  if (data === undefined) return null;

  async function request() {
    setWorking(true);
    try {
      await restPost('featured/request', undefined);
      await refetch();
      toast({ title: t('requestedToast') });
    } catch (error) {
      toast({ variant: 'danger', title: translateError(error) });
    } finally {
      setWorking(false);
    }
  }

  async function pause() {
    if (!userId) return;
    setWorking(true);
    try {
      await restPost(`featured/${userId}/pause`, undefined);
      await refetch();
      toast({ title: t('pausedToast') });
    } catch (error) {
      toast({ variant: 'danger', title: translateError(error) });
    } finally {
      setWorking(false);
    }
  }

  async function resume() {
    if (!userId) return;
    setWorking(true);
    try {
      await restPost(`featured/${userId}/resume`, undefined);
      await refetch();
      toast({ title: t('resumedToast') });
    } catch (error) {
      toast({ variant: 'danger', title: translateError(error) });
    } finally {
      setWorking(false);
    }
  }

  return (
    <section
      className="rounded-card border border-border bg-surface p-6"
      aria-labelledby="featured-status-heading"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-accent/10 p-2 text-accent-ink">
          <Sparkles aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="featured-status-heading"
            className="font-heading text-lg font-semibold text-foreground"
          >
            {t(`heading.${listing?.status ?? 'NONE'}`)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`body.${listing?.status ?? 'NONE'}`)}
          </p>

          {listing?.status === 'APPROVED' && listing.extraCommissionBps !== null && (
            <p className="mt-2 text-sm text-foreground">
              {t('commission', { percent: listing.extraCommissionBps / 100 })}
            </p>
          )}

          {listing?.status === 'REJECTED' && listing.rejectionReason && (
            <p className="mt-2 rounded-input border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
              {listing.rejectionReason}
            </p>
          )}

          {listing?.status === 'PENDING' && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('requestedOn', { date: formatDate(listing.requestedAt, locale) ?? '' })}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {(!listing || listing.status === 'REJECTED') && (
              <Button disabled={working} onClick={() => void request()}>
                {working ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <Sparkles aria-hidden />
                )}
                {listing?.status === 'REJECTED' ? t('requestAgainCta') : t('requestCta')}
              </Button>
            )}

            {listing?.status === 'APPROVED' && (
              <Button variant="outline" disabled={working} onClick={() => void pause()}>
                {working ? <Loader2 aria-hidden className="animate-spin" /> : <Pause aria-hidden />}
                {t('pauseCta')}
              </Button>
            )}

            {listing?.status === 'PAUSED' && (
              <Button disabled={working} onClick={() => void resume()}>
                {working ? <Loader2 aria-hidden className="animate-spin" /> : <Play aria-hidden />}
                {t('resumeCta')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
