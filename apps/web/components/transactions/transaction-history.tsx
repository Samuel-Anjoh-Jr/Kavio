'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatXaf } from '@/lib/discovery';
import { formatDateTime } from '@/lib/datetime';
import {
  isCredit,
  TRANSACTION_STATUS_TONE,
  TRANSACTION_TYPES,
  type TransactionStatus,
  type TransactionType,
} from '@/lib/payments';
import {
  TRANSACTIONS_QUERY,
  type TransactionItem,
  type TransactionsQueryResult,
} from '@/lib/graphql/payments';
import { cn } from '@/lib/utils';

const STATUS_FILTERS: readonly TransactionStatus[] = ['PENDING', 'SUCCESSFUL', 'FAILED'];

/**
 * Transaction history (PAY-05): every payment, escrow hold, release, refund,
 * withdrawal and fee, filterable, with per-item detail.
 *
 * A FAILED row states WHY in plain words — declined, insufficient funds, an
 * operator timeout you can retry — because "failed" with no reason is the single
 * most frustrating thing a payments screen can show someone on a phone.
 */
export function TransactionHistory() {
  const t = useTranslations('Transactions');
  const [type, setType] = useState<TransactionType | null>(null);
  const [status, setStatus] = useState<TransactionStatus | null>(null);

  const { data, loading, error } = useQuery<TransactionsQueryResult>(TRANSACTIONS_QUERY, {
    variables: { type, status, limit: 50, offset: 0 },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });

  const items = data?.transactions.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <FilterRow
          label={t('filterType')}
          options={TRANSACTION_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))}
          active={type}
          onSelect={(v) => setType(v as TransactionType | null)}
        />
        <FilterRow
          label={t('filterStatus')}
          options={STATUS_FILTERS.map((v) => ({ value: v, label: t(`txStatus.${v}`) }))}
          active={status}
          onSelect={(v) => setStatus(v as TransactionStatus | null)}
        />
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
        </div>
      ) : error && !data ? (
        <p className="text-sm text-muted-foreground">{t('transactionsLoadError')}</p>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('noTransactions')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <TransactionRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TransactionRow({ item }: { item: TransactionItem }) {
  const t = useTranslations('Transactions');
  const locale = useLocale();
  const credit = isCredit(item.type);
  const amount = formatXaf(item.amount, locale);

  return (
    <li>
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-foreground">{t(`type.${item.type}`)}</span>
            <span className="font-numeric text-xs text-muted-foreground">
              {formatDateTime(item.createdAt, locale)}
            </span>
            {item.counterpartyName && (
              <span className="truncate text-xs text-muted-foreground">
                {item.counterpartyName}
              </span>
            )}
            {item.status === 'FAILED' && item.failureReason && (
              <span className="text-xs text-danger">
                {t.has(`failure.${item.failureReason}`)
                  ? t(`failure.${item.failureReason}`)
                  : item.failureReason}
              </span>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span
              className={cn(
                'font-numeric text-sm font-semibold',
                credit ? 'text-success' : 'text-foreground',
              )}
            >
              {credit ? '+' : '−'}
              {amount}
            </span>
            <StatusBadge
              size="sm"
              tone={TRANSACTION_STATUS_TONE[item.status]}
              label={t(`txStatus.${item.status}`)}
            />
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function FilterRow({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: { value: string; label: string }[];
  active: string | null;
  onSelect: (value: string | null) => void;
}) {
  const t = useTranslations('Transactions');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <FilterChip active={active === null} onClick={() => onSelect(null)}>
        {t('filterAll')}
      </FilterChip>
      {options.map((option) => (
        <FilterChip
          key={option.value}
          active={active === option.value}
          onClick={() => onSelect(active === option.value ? null : option.value)}
        >
          {option.label}
        </FilterChip>
      ))}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-input bg-surface text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
