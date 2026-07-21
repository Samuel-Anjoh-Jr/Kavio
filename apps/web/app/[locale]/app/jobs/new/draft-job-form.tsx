'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import { useIntentReplay, useRequireAuth } from '@/components/auth/require-auth';
import type { GatedIntent } from '@/lib/intent';

interface JobDraft {
  title: string;
  description: string;
  budget: string;
}

const EMPTY: JobDraft = { title: '', description: '', budget: '' };

/**
 * The canonical gated action (ACC-02): a guest drafts a job, is bounced to auth
 * on submit, and finds the draft exactly as they left it afterwards.
 *
 * The draft rides along IN the captured intent rather than being re-fetched, so
 * work typed by someone who never had an account is not lost — which is the
 * whole point of resuming the original intent rather than merely returning to
 * the right URL.
 *
 * Actually creating the job is PROMPT 55 (Tier 2+ gate + lifecycle state
 * machine); this screen owns the draft and the resume.
 */
export function DraftJobForm() {
  const t = useTranslations('PostJob');
  const requireAuth = useRequireAuth();
  const [draft, setDraft] = useState<JobDraft>(EMPTY);
  const [resumed, setResumed] = useState(false);
  const [ready, setReady] = useState(false);

  const restore = useCallback((intent: GatedIntent) => {
    const payload = intent.payload as Partial<JobDraft> | undefined;
    if (!payload) return;

    setDraft({
      title: typeof payload.title === 'string' ? payload.title : '',
      description: typeof payload.description === 'string' ? payload.description : '',
      budget: typeof payload.budget === 'string' ? payload.budget : '',
    });
    setResumed(true);
  }, []);

  useIntentReplay('post_job', restore);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setResumed(false);

    // Guests: capture the typed draft and bounce. Signed-in users fall through
    // to the (Phase 4) create call.
    const proceeded = requireAuth('post_job', () => setReady(true), {
      payload: { ...draft },
      returnTo: '/app/jobs/new',
    });

    if (!proceeded) return;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      {resumed && <FormBanner tone="success" message={t('resumed')} />}
      {ready && <FormBanner tone="success" message={t('pendingBackend')} />}

      <Field
        label={t('titleLabel')}
        value={draft.title}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        placeholder={t('titlePlaceholder')}
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="job-description" className="text-sm font-medium text-foreground">
          {t('descriptionLabel')}
        </label>
        <textarea
          id="job-description"
          rows={5}
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          placeholder={t('descriptionPlaceholder')}
          className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-surface-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Field
        label={t('budgetLabel')}
        type="text"
        inputMode="numeric"
        value={draft.budget}
        onChange={(event) => setDraft({ ...draft, budget: event.target.value })}
        // XAF only, and XAF has no minor unit — so no decimals anywhere.
        hint={t('budgetHint')}
      />

      <Button type="submit" size="lg" disabled={draft.title.trim().length === 0}>
        {t('submit')}
      </Button>
    </form>
  );
}
