'use client';

import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { BadgeCheck, Receipt, Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/datetime';
import { formatXaf } from '@/lib/discovery';
import { graphqlErrorCode } from '@/lib/graphql/errors';
import {
  BUSINESS_ANALYTICS_QUERY,
  BUSINESS_DASHBOARD_QUERY,
  COMPANY_PAYMENTS_QUERY,
  MY_BUSINESS_ACCESS_QUERY,
  type BusinessAnalyticsQueryResult,
  type BusinessDashboardQueryResult,
  type CompanyPaymentsQueryResult,
  type MyBusinessAccessQueryResult,
} from '@/lib/graphql/business';

/**
 * The business dashboard (BIZ-01, BIZ-02): posts, applications, work in flight,
 * spend and recent payments.
 *
 * Capability-driven rather than role-driven. `myBusinessAccess` is fetched first
 * and the payments panel is only MOUNTED when the caller holds
 * `business:payments` — asking for it without the capability would return an
 * authorisation error, and an accountant-less staff member should see a
 * dashboard that fits their access rather than one full of failed panels.
 *
 * "Spend" is deliberately not called a wallet. There is no company balance:
 * every figure is aggregated live from the escrow holds on this company's jobs,
 * so it reconciles with the transaction history because it IS that history.
 */
export function BusinessDashboard({ businessProfileId }: { businessProfileId?: string }) {
  const t = useTranslations('BusinessConsole');
  const locale = useLocale();

  const variables = { businessProfileId: businessProfileId ?? null };

  const { data: accessData, loading: accessLoading } = useQuery<MyBusinessAccessQueryResult>(
    MY_BUSINESS_ACCESS_QUERY,
    { variables, fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
  );

  const access = accessData?.myBusinessAccess;
  const canSeePayments = access?.capabilities.includes('business:payments') ?? false;
  const canManageTeam = access?.capabilities.includes('business:team') ?? false;

  const { data, loading, error } = useQuery<BusinessDashboardQueryResult>(
    BUSINESS_DASHBOARD_QUERY,
    {
      variables,
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
  );

  const { data: analyticsData } = useQuery<BusinessAnalyticsQueryResult>(BUSINESS_ANALYTICS_QUERY, {
    variables,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const { data: paymentsData } = useQuery<CompanyPaymentsQueryResult>(COMPANY_PAYMENTS_QUERY, {
    variables,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    // Skipped, not rendered-and-hidden: an unauthorised read should never be
    // issued at all.
    skip: !canSeePayments,
  });

  if ((loading && !data) || (accessLoading && !accessData)) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full rounded-card" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  const dashboard = data?.businessDashboard;

  if (!dashboard) {
    // NO_BUSINESS is not a transient failure: this identity hasn't finished
    // business onboarding yet, so there is no company profile to load. Every
    // other error (network blip, unexpected server error) gets the generic
    // message instead of sending someone to re-onboard for no reason.
    if (graphqlErrorCode(error) === 'NO_BUSINESS') {
      return (
        <div className="flex flex-col items-start gap-3 rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
          <p>{t('noBusiness')}</p>
          <Button size="sm" asChild>
            <Link href="/app/onboarding/business">{t('noBusinessCta')}</Link>
          </Button>
        </div>
      );
    }

    return (
      <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
        {error ? t('loadError') : t('noBusiness')}
      </p>
    );
  }

  const analytics = analyticsData?.businessAnalytics;
  const payments = paymentsData?.companyPayments ?? [];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface p-6">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-xl font-semibold text-foreground">{dashboard.name}</h2>
          {dashboard.verified && (
            <StatusBadge tone="success" size="sm" label={t('verifiedBusiness')} className="gap-1" />
          )}
        </div>
        {canManageTeam && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/app/business/team">
              <Users aria-hidden />
              {t('manageTeam')}
            </Link>
          </Button>
        )}
      </header>

      <section>
        <h3 className="font-heading text-lg font-semibold text-foreground">{t('workHeading')}</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label={t('activePosts')}
            value={dashboard.activePosts}
            hint={t('draftPosts', { count: dashboard.draftPosts })}
          />
          <Metric label={t('pendingApplications')} value={dashboard.pendingApplications} />
          <Metric label={t('inProgressJobs')} value={dashboard.inProgressJobs} />
          <Metric label={t('completedJobs')} value={dashboard.completedJobs} />
        </div>
      </section>

      <section>
        <h3 className="font-heading text-lg font-semibold text-foreground">{t('spendHeading')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('spendCaption')}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={t('totalSpent')} value={formatXaf(dashboard.spend.totalSpent, locale)} />
          <Metric
            label={t('committedToEscrow')}
            value={formatXaf(dashboard.spend.committedToEscrow, locale)}
            hint={t('committedHint')}
          />
          <Metric
            label={t('platformFees')}
            value={formatXaf(dashboard.spend.platformFees, locale)}
          />
          <Metric
            label={t('totalRefunded')}
            value={formatXaf(dashboard.spend.totalRefunded, locale)}
          />
        </div>
      </section>

      {analytics && (
        <section>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            {t('performanceHeading')}
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label={t('jobsPosted')} value={analytics.jobsPosted} />
            <Metric
              label={t('hireRate')}
              /* NULL means "nothing posted yet", which is not a 0% hire rate —
                 rendering it as 0% would report a failure that never happened. */
              value={
                analytics.hireRate === null
                  ? t('notYetMeasured')
                  : `${Math.round(analytics.hireRate * 100)}%`
              }
              hint={t('hiredOfPosted', {
                hired: analytics.jobsHired,
                posted: analytics.jobsPosted,
              })}
            />
            <Metric
              label={t('averageJobValue')}
              value={
                analytics.averageJobValue === null
                  ? t('notYetMeasured')
                  : formatXaf(analytics.averageJobValue, locale)
              }
            />
            <Metric
              label={t('averageRating')}
              value={
                analytics.averageRating === null
                  ? t('notYetMeasured')
                  : analytics.averageRating.toFixed(1)
              }
              hint={t('ratedJobs', { count: analytics.ratedJobs })}
            />
          </div>
        </section>
      )}

      {canSeePayments && (
        <section>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            {t('recentPaymentsHeading')}
          </h3>

          {payments.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-12 text-center">
              <Receipt aria-hidden className="size-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('noPayments')}</p>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {payment.jobTitle ?? payment.description ?? t('paymentFallback')}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t(`transactionType.${payment.type}`)} ·{' '}
                      {formatDate(payment.settledAt ?? payment.createdAt, locale)}
                    </p>
                  </div>
                  <span className="font-numeric text-sm font-semibold text-foreground">
                    {formatXaf(payment.amount, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!canSeePayments && (
        <p className="flex items-center gap-2 rounded-card border border-dashed border-border p-4 text-sm text-muted-foreground">
          <BadgeCheck aria-hidden className="size-4 shrink-0" />
          {t('paymentsScopedOut')}
        </p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  /** NULL renders as a dash: an unformattable amount is missing, not zero. */
  value: string | number | null;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-numeric text-2xl font-semibold text-foreground">{value ?? '—'}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
