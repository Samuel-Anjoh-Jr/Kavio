'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { CreditCard, Loader2, Plus, Star, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/lib/api-error';
import { PAYMENT_METHOD_KINDS, type PaymentMethodKind } from '@/lib/payments';
import {
  PAYMENT_METHODS_QUERY,
  type PaymentMethod,
  type PaymentMethodsQueryResult,
} from '@/lib/graphql/payments';
import { restDelete, restPost } from '@/lib/rest-api';

/**
 * The payment-method manager (PAY-04): add, remove and set-default for the
 * Campay rails — MTN and Orange Mobile Money, card and bank, all XAF.
 *
 * The account number is captured here but never displayed back in full; the
 * read returns a masked tail only, because a wallet screen that reprints a full
 * MoMo number is a shoulder-surfing leak on a shared phone.
 */
export function PaymentMethods() {
  const t = useTranslations('Transactions');
  const { toast } = useToast();
  const { data, loading, error, refetch } = useQuery<PaymentMethodsQueryResult>(
    PAYMENT_METHODS_QUERY,
    { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
  );

  const methods = data?.paymentMethods ?? [];

  async function setDefault(id: string) {
    try {
      await restPost(`payment-methods/${id}/default`);
      toast({ title: t('defaultSet') });
      await refetch();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : t('actionFailed'),
        variant: 'danger',
      });
    }
  }

  async function remove(id: string) {
    try {
      await restDelete(`payment-methods/${id}`);
      toast({ title: t('methodRemoved') });
      await refetch();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : t('actionFailed'),
        variant: 'danger',
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('methodsSubtitle')}</p>
        <AddMethodDialog onDone={() => void refetch()} />
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
        </div>
      ) : error && !data ? (
        <p className="text-sm text-muted-foreground">{t('methodsLoadError')}</p>
      ) : methods.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('noMethods')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {methods.map((method) => (
            <MethodRow
              key={method.id}
              method={method}
              onSetDefault={() => void setDefault(method.id)}
              onRemove={() => void remove(method.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MethodRow({
  method,
  onSetDefault,
  onRemove,
}: {
  method: PaymentMethod;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations('Transactions');
  return (
    <li>
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <CreditCard aria-hidden className="size-5 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {method.label || t(`methodKind.${method.kind}`)}
              </span>
              {method.maskedAccount && (
                <span className="font-numeric text-xs text-muted-foreground">
                  {method.maskedAccount}
                </span>
              )}
            </div>
            {method.isDefault && (
              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <Star aria-hidden className="size-3 fill-primary" />
                {t('default')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!method.isDefault && (
              <Button variant="ghost" size="sm" onClick={onSetDefault}>
                {t('makeDefault')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              aria-label={t('removeMethod')}
              className="text-muted-foreground hover:text-danger"
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function AddMethodDialog({ onDone }: { onDone: () => void }) {
  const t = useTranslations('Transactions');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PaymentMethodKind>('MTN_MOMO');
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  async function submit() {
    if (!account.trim()) {
      setError({ message: t('accountRequired') });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await restPost('payment-methods', { kind, account: account.trim() });
      setOpen(false);
      setAccount('');
      toast({ title: t('methodAdded') });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: t('actionFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden />
          {t('addMethod')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('addMethod')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && <FormBanner tone="error" message={error.message} requestId={error.requestId} />}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">{t('methodKindLabel')}</label>
            <Select value={kind} onValueChange={(value) => setKind(value as PaymentMethodKind)}>
              <SelectTrigger aria-label={t('methodKindLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`methodKind.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            label={t('accountLabel')}
            inputMode="tel"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder={kind === 'MTN_MOMO' || kind === 'ORANGE_MONEY' ? '+2376XXXXXXXX' : ''}
            hint={t('accountHint')}
          />
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {t('saveMethod')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
