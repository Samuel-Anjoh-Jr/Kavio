'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { ApiError } from '@/lib/api-error';
import { parseBudget } from '@/lib/jobs';
import {
  SERVICE_CATEGORIES_QUERY,
  type ServiceCategoriesQueryResult,
} from '@/lib/graphql/discovery';
import { restPost } from '@/lib/rest-api';

/**
 * Request a Quote, from a worker's profile (PRO-04, JOB-03).
 *
 * The client already chose the counterparty — that is what a DIRECT job is
 * (JOB-01's posting gate exists precisely to distinguish this from the public
 * board, and needs no verification for it). So this describes the work,
 * creates the job, and publishes it DIRECT with `workerId` set — the server
 * requires that from a client and creates the invitation itself in the same
 * call, so there is never a moment where a client's job is live with no
 * worker attached. The worker then answers with a priced quote through the
 * normal QTE-01…QTE-03 negotiation, same as any other job.
 */
export function RequestQuoteDialog({
  workerUserId,
  workerName,
  open,
  onOpenChange,
}: {
  workerUserId: string;
  workerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('RequestQuote');
  const locale = useLocale();
  const router = useRouter();

  const { data: categoryData } = useQuery<ServiceCategoriesQueryResult>(SERVICE_CATEGORIES_QUERY, {
    variables: { topLevelOnly: false },
  });
  const categories = categoryData?.serviceCategories ?? [];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const budgetValue = parseBudget(budget);

  function reset() {
    setTitle('');
    setDescription('');
    setCategoryId(undefined);
    setBudget('');
    setError(null);
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const job = await restPost<{ id: string }>('jobs', {
        title: title.trim(),
        description: description.trim(),
        categoryId,
        budgetMin: budgetValue ?? undefined,
        budgetMax: budgetValue ?? undefined,
      });

      // workerId travels WITH the publish call: the server requires a client's
      // DIRECT publish to name the one worker it is for (JOB-01 anti-lure), and
      // creates the invitation itself in the same request.
      await restPost(`jobs/${job.id}/publish`, { visibility: 'DIRECT', workerId: workerUserId });

      reset();
      onOpenChange(false);
      router.push(`/app/jobs/${job.id}`);
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: t('failed') });
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    title.trim().length >= 3 && description.trim().length >= 20 && Boolean(categoryId) && !busy;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          onOpenChange(next);
          if (!next) reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title', { name: workerName })}</DialogTitle>
          <DialogDescription>{t('subtitle', { name: workerName })}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {error && <FormBanner tone="error" message={error.message} requestId={error.requestId} />}

          <Field
            label={t('jobTitleLabel')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('jobTitlePlaceholder')}
            maxLength={140}
          />

          <div className="flex flex-col gap-2">
            <label
              htmlFor="request-quote-description"
              className="text-sm font-medium text-foreground"
            >
              {t('descriptionLabel')}
            </label>
            <textarea
              id="request-quote-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              maxLength={5000}
              className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-surface-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">{t('categoryLabel')}</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger aria-label={t('categoryLabel')}>
                <SelectValue placeholder={t('categoryPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {locale === 'fr' ? category.nameFr : category.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Field
            label={t('budgetLabel')}
            inputMode="numeric"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="20000"
            hint={t('budgetHint')}
          />

          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {t('submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
