'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, MessageSquareQuote, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useIntentReplay, useRequireAuth } from '@/components/auth/require-auth';
import { ApiError } from '@/lib/api-error';
import {
  createEndorsement,
  ENDORSEMENT_RELATIONSHIPS,
  type EndorsementRelationship,
} from '@/lib/endorsements';
import { cn } from '@/lib/utils';

const QUOTE_MIN_LENGTH = 10;
const QUOTE_MAX_LENGTH = 500;

interface EndorsementDraft {
  relationship: EndorsementRelationship;
  quote: string;
  rating: number;
}

const EMPTY_DRAFT: EndorsementDraft = {
  relationship: 'PREVIOUS_CUSTOMER',
  quote: '',
  rating: 5,
};

/**
 * Lets a past customer or community leader vouch for a worker (P30, TRU-10).
 *
 * Open to guests deliberately: a shared profile link is exactly how someone is
 * meant to arrive here, often with no Kavio account yet. The FORM itself is
 * never gated — only the submit is (ACC-02) — because asking someone to sign
 * up before they have written a word is how a genuine endorsement gets
 * abandoned instead of finished. What they typed rides the auth detour whole,
 * as the intent's payload, and is submitted automatically once they have an
 * account — not just restored for them to press submit a second time.
 */
export function EndorseDialog({
  subjectId,
  subjectName,
}: {
  subjectId: string;
  subjectName: string;
}) {
  const t = useTranslations('Endorsement');
  const requireAuth = useRequireAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EndorsementDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quoteValid =
    draft.quote.trim().length >= QUOTE_MIN_LENGTH && draft.quote.trim().length <= QUOTE_MAX_LENGTH;

  async function submit(values: EndorsementDraft) {
    setSubmitting(true);
    setError(null);
    try {
      await createEndorsement({
        subjectId,
        relationship: values.relationship,
        quote: values.quote.trim(),
        rating: values.rating,
      });
      setOpen(false);
      setDraft(EMPTY_DRAFT);
      toast({ title: t('submitted', { name: subjectName }) });
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : 'UNKNOWN_ERROR';
      setError(t.has(`error.${code}`) ? t(`error.${code}`) : t('error.UNKNOWN_ERROR'));
      // Reopened with what they wrote still in it: someone who just finished
      // creating an account should never be asked to type this twice.
      setOpen(true);
    } finally {
      setSubmitting(false);
    }
  }

  useIntentReplay('give_endorsement', (intent) => {
    const payload = intent.payload as Partial<EndorsementDraft & { subjectId: string }> | undefined;
    if (
      payload?.subjectId !== subjectId ||
      !payload.quote ||
      !payload.relationship ||
      !payload.rating
    ) {
      return;
    }

    const restored: EndorsementDraft = {
      relationship: payload.relationship,
      quote: payload.quote,
      rating: payload.rating,
    };
    setDraft(restored);
    toast({ title: t('submitting') });
    void submit(restored);
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!quoteValid) return;
    requireAuth('give_endorsement', () => void submit(draft), {
      payload: { subjectId, ...draft },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setDraft(EMPTY_DRAFT);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageSquareQuote aria-hidden />
          {t('give')}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('dialogTitle', { name: subjectName })}</DialogTitle>
          <DialogDescription>{t('dialogSubtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endorsement-relationship">{t('relationshipLabel')}</Label>
            <select
              id="endorsement-relationship"
              value={draft.relationship}
              disabled={submitting}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  relationship: event.target.value as EndorsementRelationship,
                }))
              }
              className="h-11 rounded-input border border-input bg-surface px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {ENDORSEMENT_RELATIONSHIPS.map((value) => (
                <option key={value} value={value}>
                  {t(`relationship.${value}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('ratingLabel')}</Label>
            <div
              className="flex items-center gap-1"
              role="radiogroup"
              aria-label={t('ratingLabel')}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={draft.rating === value}
                  aria-label={t('ratingStar', { count: value })}
                  disabled={submitting}
                  onClick={() => setDraft((prev) => ({ ...prev, rating: value }))}
                  className="rounded-input p-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  <Star
                    aria-hidden
                    className={cn(
                      'size-6',
                      value <= draft.rating ? 'fill-warning text-warning' : 'text-muted-foreground',
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endorsement-quote">{t('quoteLabel')}</Label>
            <textarea
              id="endorsement-quote"
              value={draft.quote}
              minLength={QUOTE_MIN_LENGTH}
              maxLength={QUOTE_MAX_LENGTH}
              rows={4}
              disabled={submitting}
              placeholder={t('quotePlaceholder')}
              onChange={(event) => setDraft((prev) => ({ ...prev, quote: event.target.value }))}
              className="w-full resize-none rounded-input border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <p className="text-xs text-muted-foreground">
              {t('quoteHint', { min: QUOTE_MIN_LENGTH })}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting || !quoteValid}>
              {submitting && <Loader2 aria-hidden className="animate-spin" />}
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
