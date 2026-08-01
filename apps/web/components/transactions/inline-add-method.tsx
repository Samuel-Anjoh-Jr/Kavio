'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api-error';
import type { DefaultMomoMethod } from '@/lib/graphql/payments';
import { restPost } from '@/lib/rest-api';

type MomoKind = 'MTN_MOMO' | 'ORANGE_MONEY';

/**
 * The remedy for "no payment method on file yet", inline rather than a dead
 * end (PAY-04). Renders wherever Add money, Withdraw or Pay now discovers
 * there is no Mobile Money method to use — saves one right here, in the same
 * modal, and hands it straight back so the caller can continue the action it
 * was already mid-way through instead of sending the user off to go find
 * Payment methods on their own.
 */
export function InlineAddMomoMethod({ onAdded }: { onAdded: (method: DefaultMomoMethod) => void }) {
  const t = useTranslations('Transactions');
  const [kind, setKind] = useState<MomoKind>('MTN_MOMO');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  async function submit() {
    if (!phone.trim()) {
      setError({ message: t('accountRequired') });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await restPost<DefaultMomoMethod>('payment-methods', {
        type: kind,
        phone: phone.trim(),
      });
      onAdded(created);
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: t('actionFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-dashed border-border bg-surface/50 p-4">
      <p className="text-sm text-muted-foreground">{t('noMethodOnFile')}</p>
      {error && <FormBanner tone="error" message={error.message} requestId={error.requestId} />}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">{t('methodKindLabel')}</label>
        <Select value={kind} onValueChange={(value) => setKind(value as MomoKind)}>
          <SelectTrigger aria-label={t('methodKindLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MTN_MOMO">{t('methodKind.MTN_MOMO')}</SelectItem>
            <SelectItem value="ORANGE_MONEY">{t('methodKind.ORANGE_MONEY')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Field
        label={t('accountLabel')}
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+2376XXXXXXXX"
        hint={t('accountHint')}
      />
      <Button variant="outline" onClick={() => void submit()} disabled={busy}>
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
        {t('saveMethod')}
      </Button>
    </div>
  );
}
