'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/lib/api-error';
import { formatXaf } from '@/lib/discovery';
import { parseBudget } from '@/lib/jobs';
import {
  DEFAULT_MOMO_METHOD_QUERY,
  WALLET_QUERY,
  type DefaultMomoMethodQueryResult,
  type WalletQueryResult,
} from '@/lib/graphql/payments';
import { restPatch, restPost } from '@/lib/rest-api';

/**
 * The wallet balance card (PAY-05): available balance, funds in escrow, and the
 * Add money / Withdraw actions that move money via Campay.
 *
 * The balance backend lands in a parallel lane (PROMPTS 63-66). Until it answers
 * this card shows a calm "coming online" figure rather than a hard error — the
 * escrow timelines below it already run on real data, so the wallet screen is
 * useful in the meantime.
 */
export function WalletBalanceCard() {
  const t = useTranslations('Transactions');
  const locale = useLocale();
  const { data, loading, error, refetch } = useQuery<WalletQueryResult>(WALLET_QUERY, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const wallet = data?.wallet;
  const pending = !wallet && Boolean(error);

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Wallet aria-hidden className="size-4" />
              {t('availableBalance')}
            </span>
            {loading && !wallet ? (
              <Skeleton className="h-9 w-32" />
            ) : (
              <span className="font-numeric text-3xl font-semibold text-foreground">
                {pending ? t('pendingAmount') : formatXaf(wallet?.availableBalance ?? 0, locale)}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{t('inEscrow')}</span>
            {loading && !wallet ? (
              <Skeleton className="h-9 w-32" />
            ) : (
              <span className="font-numeric text-3xl font-semibold text-accent">
                {pending ? t('pendingAmount') : formatXaf(wallet?.inEscrow ?? 0, locale)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <MoveMoneyDialog
            mode="add"
            trigger={
              <Button>
                <ArrowDownToLine aria-hidden />
                {t('addMoney')}
              </Button>
            }
            onDone={() => void refetch()}
          />
          <MoveMoneyDialog
            mode="withdraw"
            trigger={
              <Button variant="outline">
                <ArrowUpFromLine aria-hidden />
                {t('withdraw')}
              </Button>
            }
            onDone={() => void refetch()}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MoveMoneyDialog({
  mode,
  trigger,
  onDone,
}: {
  mode: 'add' | 'withdraw';
  trigger: React.ReactNode;
  onDone: () => void;
}) {
  const t = useTranslations('Transactions');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  // Which Mobile Money number this move will actually use — shown so it can be
  // confirmed or corrected before money moves, rather than trusted silently.
  const { data: methodData } = useQuery<DefaultMomoMethodQueryResult>(DEFAULT_MOMO_METHOD_QUERY, {
    skip: !open,
    fetchPolicy: 'cache-and-network',
  });
  const defaultMethod = methodData?.paymentMethods.find(
    (m) => m.isDefault && (m.type === 'MTN_MOMO' || m.type === 'ORANGE_MONEY'),
  );
  const [phone, setPhone] = useState('');
  // Tracks which method's number is currently reflected in `phone`, so a
  // fresh load (a different id, or the dialog reopening after `onOpenChange`
  // clears this) resyncs the field exactly once without fighting whatever
  // the user is actively typing.
  const [syncedMethodId, setSyncedMethodId] = useState<string | null>(null);

  if (defaultMethod && defaultMethod.id !== syncedMethodId) {
    setSyncedMethodId(defaultMethod.id);
    setPhone(defaultMethod.phone ?? '');
  }

  const value = parseBudget(amount);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Fresh confirmation every time the dialog is reopened, not whatever
      // was last typed — a stale edit from a previous visit is exactly the
      // kind of silent mistake this step exists to prevent.
      setSyncedMethodId(null);
      setPhone('');
    }
  }

  async function submit() {
    if (!value) {
      setError({ message: t('amountRequired') });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const trimmedPhone = phone.trim();
      if (defaultMethod && trimmedPhone && trimmedPhone !== (defaultMethod.phone ?? '')) {
        await restPatch(`payment-methods/${defaultMethod.id}`, { phone: trimmedPhone });
      }
      await restPost(mode === 'add' ? 'wallet/add-money' : 'wallet/withdraw', { amount: value });
      setOpen(false);
      setAmount('');
      toast({ title: mode === 'add' ? t('addRequested') : t('withdrawRequested') });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: t('moveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? t('addMoney') : t('withdraw')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && <FormBanner tone="error" message={error.message} requestId={error.requestId} />}
          <Field
            label={t('amountLabel')}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10000"
            hint={t('amountHint')}
          />
          {defaultMethod && (
            <Field
              label={mode === 'add' ? t('sourceNumberLabel') : t('payoutNumberLabel')}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              hint={t('confirmNumberHint')}
            />
          )}
          <Button onClick={() => void submit()} disabled={busy || !value}>
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {mode === 'add' ? t('continueToPay') : t('confirmWithdraw')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
