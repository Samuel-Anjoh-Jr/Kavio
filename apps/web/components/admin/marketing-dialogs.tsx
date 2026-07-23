'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useAuthErrorMessage } from '@/lib/auth-errors';
import type { ApiError } from '@/lib/api-error';
import { createFaq, createTestimonial, updateFaq, updateTestimonial } from '@/lib/marketing';
import type { FaqEntry, TestimonialEntry } from '@/lib/graphql/marketing';

/**
 * The create/edit forms for FAQ and testimonials (SRS §26.2; PROMPT 92.1).
 *
 * One dialog per entity handles BOTH create and edit — presence of the record
 * prop is the only difference. Every mutating field carries inline validation
 * and, on failure, the API's field-level errors are mapped back onto the inputs
 * rather than shown as one banner (SYS-06): a Zod rejection on `rating` should
 * light up the rating field, not make the admin hunt for which of eight inputs
 * the server disliked.
 */

type FieldErrors = Record<string, string | undefined>;

/** Maps the API's { fields } payload onto local field state, else a banner. */
function useSubmit() {
  const translateError = useAuthErrorMessage();
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});

  const run = async (action: () => Promise<unknown>, onDone: () => void) => {
    setSubmitting(true);
    setBanner(null);
    setFields({});
    try {
      await action();
      onDone();
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.fields) {
        const mapped: FieldErrors = {};
        for (const [key, messages] of Object.entries(apiError.fields)) {
          mapped[key] = messages[0];
        }
        setFields(mapped);
      } else {
        setBanner(translateError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return { submitting, banner, fields, run };
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// ── FAQ ──────────────────────────────────────────────────────────────────────

export function FaqDialog({
  faq,
  trigger,
  onSaved,
}: {
  faq?: FaqEntry;
  trigger: ReactNode;
  onSaved: () => void;
}) {
  const t = useTranslations('Admin.marketing');
  const [open, setOpen] = useState(false);
  const { submitting, banner, fields, run } = useSubmit();
  const ids = useId();

  const [form, setForm] = useState({
    questionEn: faq?.questionEn ?? '',
    questionFr: faq?.questionFr ?? '',
    answerEn: faq?.answerEn ?? '',
    answerFr: faq?.answerFr ?? '',
    category: faq?.category ?? '',
    isPublished: faq?.isPublished ?? true,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      questionEn: form.questionEn.trim(),
      questionFr: form.questionFr.trim(),
      answerEn: form.answerEn.trim(),
      answerFr: form.answerFr.trim(),
      category: form.category.trim() || null,
      isPublished: form.isPublished,
    };

    void run(
      () => (faq ? updateFaq(faq.id, payload) : createFaq(payload)),
      () => {
        setOpen(false);
        onSaved();
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{faq ? t('editFaq') : t('addFaq')}</DialogTitle>
          <DialogDescription>{t('faqDialogHint')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field id={`${ids}-qen`} label={t('questionEn')} error={fields.questionEn}>
            <Input
              id={`${ids}-qen`}
              value={form.questionEn}
              onChange={(e) => set('questionEn', e.target.value)}
              aria-invalid={Boolean(fields.questionEn)}
              required
            />
          </Field>
          <Field id={`${ids}-qfr`} label={t('questionFr')} error={fields.questionFr}>
            <Input
              id={`${ids}-qfr`}
              value={form.questionFr}
              onChange={(e) => set('questionFr', e.target.value)}
              aria-invalid={Boolean(fields.questionFr)}
              required
            />
          </Field>
          <Field id={`${ids}-aen`} label={t('answerEn')} error={fields.answerEn}>
            <textarea
              id={`${ids}-aen`}
              value={form.answerEn}
              onChange={(e) => set('answerEn', e.target.value)}
              aria-invalid={Boolean(fields.answerEn)}
              rows={3}
              required
              className="flex w-full rounded-input border border-input bg-surface px-4 py-2 text-sm text-surface-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-danger"
            />
          </Field>
          <Field id={`${ids}-afr`} label={t('answerFr')} error={fields.answerFr}>
            <textarea
              id={`${ids}-afr`}
              value={form.answerFr}
              onChange={(e) => set('answerFr', e.target.value)}
              aria-invalid={Boolean(fields.answerFr)}
              rows={3}
              required
              className="flex w-full rounded-input border border-input bg-surface px-4 py-2 text-sm text-surface-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-danger"
            />
          </Field>
          <Field id={`${ids}-cat`} label={t('categoryOptional')} error={fields.category}>
            <Input
              id={`${ids}-cat`}
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              placeholder={t('categoryPlaceholder')}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) => set('isPublished', e.target.checked)}
              className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
            {t('published')}
          </label>

          {banner && (
            <p role="alert" className="text-sm text-danger">
              {banner}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Testimonials ─────────────────────────────────────────────────────────────

export function TestimonialDialog({
  testimonial,
  trigger,
  onSaved,
}: {
  testimonial?: TestimonialEntry;
  trigger: ReactNode;
  onSaved: () => void;
}) {
  const t = useTranslations('Admin.marketing');
  const [open, setOpen] = useState(false);
  const { submitting, banner, fields, run } = useSubmit();
  const ids = useId();

  const [form, setForm] = useState({
    author: testimonial?.author ?? '',
    roleEn: testimonial?.roleEn ?? '',
    roleFr: testimonial?.roleFr ?? '',
    avatarUrl: testimonial?.avatarUrl ?? '',
    contentEn: testimonial?.contentEn ?? '',
    contentFr: testimonial?.contentFr ?? '',
    rating: testimonial?.rating ?? 5,
    visible: testimonial?.visible ?? true,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      author: form.author.trim(),
      roleEn: form.roleEn.trim(),
      roleFr: form.roleFr.trim(),
      avatarUrl: form.avatarUrl.trim() || null,
      contentEn: form.contentEn.trim(),
      contentFr: form.contentFr.trim(),
      rating: form.rating,
      visible: form.visible,
    };

    void run(
      () => (testimonial ? updateTestimonial(testimonial.id, payload) : createTestimonial(payload)),
      () => {
        setOpen(false);
        onSaved();
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{testimonial ? t('editTestimonial') : t('addTestimonial')}</DialogTitle>
          <DialogDescription>{t('testimonialDialogHint')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field id={`${ids}-author`} label={t('author')} error={fields.author}>
            <Input
              id={`${ids}-author`}
              value={form.author}
              onChange={(e) => set('author', e.target.value)}
              aria-invalid={Boolean(fields.author)}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id={`${ids}-roleen`} label={t('roleEn')} error={fields.roleEn}>
              <Input
                id={`${ids}-roleen`}
                value={form.roleEn}
                onChange={(e) => set('roleEn', e.target.value)}
                aria-invalid={Boolean(fields.roleEn)}
                required
              />
            </Field>
            <Field id={`${ids}-rolefr`} label={t('roleFr')} error={fields.roleFr}>
              <Input
                id={`${ids}-rolefr`}
                value={form.roleFr}
                onChange={(e) => set('roleFr', e.target.value)}
                aria-invalid={Boolean(fields.roleFr)}
                required
              />
            </Field>
          </div>

          <Field id={`${ids}-cen`} label={t('contentEn')} error={fields.contentEn}>
            <textarea
              id={`${ids}-cen`}
              value={form.contentEn}
              onChange={(e) => set('contentEn', e.target.value)}
              aria-invalid={Boolean(fields.contentEn)}
              rows={3}
              required
              className="flex w-full rounded-input border border-input bg-surface px-4 py-2 text-sm text-surface-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-danger"
            />
          </Field>
          <Field id={`${ids}-cfr`} label={t('contentFr')} error={fields.contentFr}>
            <textarea
              id={`${ids}-cfr`}
              value={form.contentFr}
              onChange={(e) => set('contentFr', e.target.value)}
              aria-invalid={Boolean(fields.contentFr)}
              rows={3}
              required
              className="flex w-full rounded-input border border-input bg-surface px-4 py-2 text-sm text-surface-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-danger"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id={`${ids}-rating`} label={t('rating')} error={fields.rating}>
              <Input
                id={`${ids}-rating`}
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={form.rating}
                onChange={(e) => set('rating', Number(e.target.value))}
                aria-invalid={Boolean(fields.rating)}
                required
              />
            </Field>
            <Field id={`${ids}-avatar`} label={t('avatarOptional')} error={fields.avatarUrl}>
              <Input
                id={`${ids}-avatar`}
                type="url"
                value={form.avatarUrl}
                onChange={(e) => set('avatarUrl', e.target.value)}
                aria-invalid={Boolean(fields.avatarUrl)}
                placeholder="https://…"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.visible}
              onChange={(e) => set('visible', e.target.checked)}
              className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
            {t('visible')}
          </label>

          {banner && (
            <p role="alert" className="text-sm text-danger">
              {banner}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
