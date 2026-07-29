'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api-error';
import { parseBudget } from '@/lib/jobs';
import { QUOTE_DURATION_UNITS, type QuoteDurationUnit } from '@/lib/quotes';
import type { Quote } from '@/lib/graphql/quotes';
import { restPatch, restPost } from '@/lib/rest-api';

type QuoteComposerProps =
  | {
      mode: 'edit' | 'revise';
      quote: Quote;
      jobId?: undefined;
      trigger: ReactNode;
      onSaved: () => void;
    }
  | { mode: 'create'; quote?: undefined; jobId: string; trigger: ReactNode; onSaved: () => void };

/**
 * The worker's quote composer (QTE-01): an itemised, priced offer.
 *
 * Three entry points, one form:
 *  - CREATE the first quote on a job (POST /jobs/:jobId/quotes, sent immediately),
 *  - EDIT a still-DRAFT quote (PATCH), or
 *  - REVISE a sent quote as a counter-offer (POST /revise) — a revision is a NEW
 *    quote chained to the one it supersedes, so the form carries a full offer,
 *    not a delta (matches the API's reviseQuoteSchema and createQuoteSchema).
 *
 * "What's included" is a real itemised list rather than a paragraph, because a
 * client comparing two quotes needs to compare line items, not prose.
 */
export function QuoteComposer(props: QuoteComposerProps) {
  const { mode, trigger, onSaved } = props;
  const quote = mode === 'create' ? null : props.quote;
  const t = useTranslations('Quotes');
  const [open, setOpen] = useState(false);

  const [price, setPrice] = useState(String(quote?.price || ''));
  const [durationValue, setDurationValue] = useState(
    quote?.durationValue ? String(quote.durationValue) : '',
  );
  const [durationUnit, setDurationUnit] = useState<QuoteDurationUnit>(quote?.durationUnit ?? 'DAY');
  const [includes, setIncludes] = useState<string[]>(quote?.includes ?? []);
  const [newItem, setNewItem] = useState('');
  const [message, setMessage] = useState(quote?.message ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const priceValue = parseBudget(price);
  const durationNumber = durationValue.trim() ? Number(durationValue.replace(/[^\d]/g, '')) : null;

  function addItem() {
    const trimmed = newItem.trim();
    if (!trimmed || includes.length >= 20) return;
    setIncludes((current) => [...current, trimmed]);
    setNewItem('');
  }

  async function save() {
    if (!priceValue) {
      setError({ message: t('priceRequired') });
      return;
    }
    setSaving(true);
    setError(null);

    const body = {
      price: priceValue,
      durationValue: durationNumber ?? undefined,
      durationUnit: durationNumber ? durationUnit : undefined,
      includes: includes.length > 0 ? includes : undefined,
      message: message.trim() || undefined,
    };

    try {
      if (mode === 'edit') {
        await restPatch(`quotes/${props.quote.id}`, body);
      } else if (mode === 'revise') {
        await restPost(`quotes/${props.quote.id}/revise`, { ...body, send: true });
      } else {
        await restPost(`jobs/${props.jobId}/quotes`, { ...body, send: true });
      }
      setOpen(false);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: t('saveFailed') });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit'
              ? t('editQuote')
              : mode === 'revise'
                ? t('reviseQuote')
                : t('sendQuote')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {error && <FormBanner tone="error" message={error.message} requestId={error.requestId} />}

          <Field
            label={t('priceLabel')}
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="25000"
            hint={t('priceHint')}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t('durationLabel')}
              inputMode="numeric"
              value={durationValue}
              onChange={(e) => setDurationValue(e.target.value)}
              placeholder="3"
            />
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">
                {t('durationUnitLabel')}
              </label>
              <Select
                value={durationUnit}
                onValueChange={(value) => setDurationUnit(value as QuoteDurationUnit)}
              >
                <SelectTrigger aria-label={t('durationUnitLabel')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUOTE_DURATION_UNITS.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {t(`durationUnit.${unit}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">{t('includesLabel')}</label>
            {includes.length > 0 && (
              <ul className="flex flex-col gap-2">
                {includes.map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-input border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <span className="text-surface-foreground">{item}</span>
                    <button
                      type="button"
                      aria-label={t('removeItem')}
                      onClick={() => setIncludes((c) => c.filter((_, i) => i !== index))}
                      className="text-muted-foreground hover:text-danger"
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem();
                  }
                }}
                placeholder={t('includesPlaceholder')}
                maxLength={200}
              />
              <Button type="button" variant="outline" size="icon" onClick={addItem}>
                <Plus aria-hidden />
                <span className="sr-only">{t('addItem')}</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="quote-message" className="text-sm font-medium text-foreground">
              {t('messageLabel')}
            </label>
            <textarea
              id="quote-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              placeholder={t('messagePlaceholder')}
              className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-surface-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <Button onClick={() => void save()} disabled={saving || !priceValue}>
            {saving ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {mode === 'edit'
              ? t('saveDraft')
              : mode === 'revise'
                ? t('sendRevision')
                : t('sendQuote')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
