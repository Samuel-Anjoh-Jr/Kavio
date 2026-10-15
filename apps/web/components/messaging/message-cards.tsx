'use client';

import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Briefcase, FileText, Wallet, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatXaf } from '@/lib/discovery';
import { ESCROW_QUERY, type EscrowQueryResult } from '@/lib/graphql/payments';
import { ESCROW_STATE_TONE, ESCROW_STATE_LABEL_KEY } from '@/lib/payments';

/**
 * Inline cards for QUOTE / JOB / PAYMENT messages (MSG-02).
 *
 * These carry a `refId` (never a copied snapshot of the record), so the card
 * always reflects the CURRENT state — a quote card in an old message shows the
 * quote as it is now, and the escrow line under a payment card is live. A chat
 * that quietly disagreed with the wallet about whether money had moved would be
 * worse than no card at all.
 */

export function JobCard({ jobId }: { jobId: string }) {
  const t = useTranslations('Messaging');

  return (
    <Link
      href={`/app/jobs/${jobId}`}
      className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:bg-muted"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Briefcase aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{t('cards.jobTitle')}</span>
        <span className="block text-xs text-muted-foreground">{t('cards.viewJob')}</span>
      </span>
    </Link>
  );
}

/**
 * Unlike JobCard and PaymentCard, this takes no id: quotes have no detail route
 * yet (QTE-04 ships them as Sent/Received/Drafts inboxes), so the card routes to
 * the inbox. Threading an id through to a link that ignores it would only look
 * like navigation that works.
 */
export function QuoteCard() {
  const t = useTranslations('Messaging');

  return (
    <Link
      href="/app/quotes"
      className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:bg-muted"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-ink">
        <FileText aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{t('cards.quoteTitle')}</span>
        <span className="block text-xs text-muted-foreground">{t('cards.viewQuote')}</span>
      </span>
    </Link>
  );
}

/**
 * A payment card with the LIVE escrow state under it (MSG-02, PAY-02).
 *
 * `bookingId` is the refId; the escrow read resolves the current hold, so the
 * "funds secure" assurance in chat is the same fact the wallet shows, never a
 * stale echo.
 */
export function PaymentCard({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Messaging');
  const locale = useLocale();

  const { data, loading } = useQuery<EscrowQueryResult>(ESCROW_QUERY, {
    variables: { bookingId },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const escrow = data?.escrow;

  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
          <Wallet aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{t('cards.paymentTitle')}</p>
          {loading && !escrow ? (
            <Skeleton className="mt-1 h-4 w-24" />
          ) : escrow ? (
            <p className="font-numeric text-sm text-foreground">
              {formatXaf(escrow.amount, locale)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('cards.paymentPending')}</p>
          )}
        </div>
      </div>

      {escrow && (
        <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
          <ShieldCheck aria-hidden className="size-3.5 text-success" />
          <StatusBadge
            tone={ESCROW_STATE_TONE[escrow.state as keyof typeof ESCROW_STATE_TONE] ?? 'neutral'}
            size="sm"
            label={t(
              ESCROW_STATE_LABEL_KEY[escrow.state as keyof typeof ESCROW_STATE_LABEL_KEY] ??
                'cards.escrowUnknown',
            )}
          />
          <span className="text-xs text-muted-foreground">{t('cards.fundsSecure')}</span>
        </div>
      )}
    </div>
  );
}
