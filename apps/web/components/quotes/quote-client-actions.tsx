'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Loader2, MessageCircle, Repeat, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
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
import { useRequireAuth } from '@/components/auth/require-auth';
import { ApiError } from '@/lib/api-error';
import { formatXaf } from '@/lib/discovery';
import { parseBudget } from '@/lib/jobs';
import { estimateFee } from '@/lib/payments';
import type { Quote } from '@/lib/graphql/quotes';
import { restPost } from '@/lib/rest-api';

/**
 * The client's actions on a received quote (QTE-02, QTE-05): Accept, Decline,
 * Counter and Chat.
 *
 * Accepting is the money moment, so the fee is shown BEFORE it (PAY-02): the
 * dialog lays out price, the ~10% platform fee and what the worker receives, so
 * the ~10% is never a surprise sprung at payment. Accepting creates the booking
 * and initiates escrow (the entry point for PAY-01), then routes to the wallet
 * where the funds are visibly held.
 */
export function QuoteClientActions({ quote, onChanged }: { quote: Quote; onChanged: () => void }) {
  const t = useTranslations('Quotes');
  const { toast } = useToast();
  const requireAuth = useRequireAuth();

  const actionable = quote.status === 'SENT' || quote.status === 'VIEWED';
  if (!actionable) return null;

  function chat() {
    requireAuth('contact_worker', () => toast({ title: t('messagingSoon') }));
  }

  return (
    <>
      <AcceptDialog quote={quote} onDone={onChanged} />
      <CounterDialog quote={quote} onDone={onChanged} />
      <DeclineDialog quote={quote} onDone={onChanged} />
      <Button variant="ghost" size="sm" onClick={chat}>
        <MessageCircle aria-hidden />
        {t('chat')}
      </Button>
    </>
  );
}

function AcceptDialog({ quote, onDone }: { quote: Quote; onDone: () => void }) {
  const t = useTranslations('Quotes');
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const fee = estimateFee(quote.price);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await restPost(`quotes/${quote.id}/accept`);
      setOpen(false);
      toast({ title: t('accepted') });
      onDone();
      router.push('/app/wallet');
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: t('acceptFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="success">
          <Check aria-hidden />
          {t('accept')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('acceptTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && <FormBanner tone="error" message={error.message} requestId={error.requestId} />}

          <dl className="divide-y divide-border rounded-card border border-border">
            <FeeRow label={t('feeQuotePrice')} value={formatXaf(fee.price, locale)} />
            <FeeRow label={t('feePlatform')} value={`− ${formatXaf(fee.fee, locale)}`} muted />
            <FeeRow label={t('feeWorkerGets')} value={formatXaf(fee.workerPayout, locale)} strong />
          </dl>

          <p className="text-xs text-muted-foreground">{t('feeDisclaimer')}</p>

          <div className="rounded-card border border-success/25 bg-success/10 px-3 py-2 text-sm text-success">
            {t('escrowAssurance')}
          </div>

          <Button variant="success" onClick={() => void accept()} disabled={busy}>
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
            {t('acceptAndPay')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CounterDialog({ quote, onDone }: { quote: Quote; onDone: () => void }) {
  const t = useTranslations('Quotes');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const targetValue = parseBudget(target);

  async function submit() {
    if (!targetValue && !message.trim()) {
      setError({ message: t('counterNeedsSomething') });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await restPost(`quotes/${quote.id}/request-counter`, {
        targetPrice: targetValue ?? undefined,
        message: message.trim() || undefined,
      });
      setOpen(false);
      toast({ title: t('counterSent') });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: t('saveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Repeat aria-hidden />
          {t('counter')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('counterTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && <FormBanner tone="error" message={error.message} requestId={error.requestId} />}
          <Field
            label={t('counterPriceLabel')}
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="20000"
            hint={t('counterPriceHint')}
          />
          <div className="flex flex-col gap-2">
            <label htmlFor="counter-message" className="text-sm font-medium text-foreground">
              {t('counterMessageLabel')}
            </label>
            <textarea
              id="counter-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              placeholder={t('counterMessagePlaceholder')}
              className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-surface-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {t('sendCounter')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeclineDialog({ quote, onDone }: { quote: Quote; onDone: () => void }) {
  const t = useTranslations('Quotes');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await restPost(`quotes/${quote.id}/decline`, { reason: reason.trim() || undefined });
      setOpen(false);
      toast({ title: t('declined') });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10">
          <X aria-hidden />
          {t('decline')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('declineTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && <FormBanner tone="error" message={error} />}
          <div className="flex flex-col gap-2">
            <label htmlFor="decline-reason" className="text-sm font-medium text-foreground">
              {t('declineReasonLabel')}
            </label>
            <textarea
              id="decline-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder={t('declineReasonPlaceholder')}
              className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-surface-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Button variant="danger" onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {t('confirmDecline')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FeeRow({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string | null;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          strong
            ? 'font-numeric font-semibold text-foreground'
            : muted
              ? 'font-numeric text-muted-foreground'
              : 'font-numeric text-foreground'
        }
      >
        {value}
      </span>
    </div>
  );
}
