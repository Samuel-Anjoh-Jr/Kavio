'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  MessageSquareQuote,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { ListSkeleton } from '@/components/system/skeletons';
import { EmptyState } from '@/components/system/empty-state';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import {
  ADMIN_MARKETING_CONTENT_QUERY,
  type FaqEntry,
  type MarketingContentQueryResult,
  type TestimonialEntry,
} from '@/lib/graphql/marketing';
import {
  deleteFaq,
  deleteTestimonial,
  moveWithin,
  reorderFaqs,
  reorderTestimonials,
} from '@/lib/marketing';
import { FaqDialog, TestimonialDialog } from './marketing-dialogs';

/**
 * The marketing-content console (SRS §26.2; PROMPT 92.1).
 *
 * Reads run through the SAME resolvers the landing page uses, with
 * `includeUnpublished`/`includeHidden` — the API honours those flags against the
 * caller's role, so there is one query and one filter, never an admin-only copy
 * of the read that could drift from the public one.
 *
 * Reorder is up/down buttons, not drag: a pointer-drag reorder is invisible to a
 * keyboard and clumsy on a phone, and the console is used in the field
 * (NFR-A11Y-01). Each move posts the whole new order in one atomic request, so a
 * visitor never loads the page against a half-applied sequence.
 */
export function MarketingManager() {
  const { data, loading, error, refetch } = useQuery<MarketingContentQueryResult>(
    ADMIN_MARKETING_CONTENT_QUERY,
    { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
  );

  const faqs = [...(data?.faqs ?? [])].sort((a, b) => a.order - b.order);
  const testimonials = [...(data?.testimonials ?? [])].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col gap-12">
      <FaqPanel
        faqs={faqs}
        loading={loading && !data}
        loadFailed={Boolean(error) && faqs.length === 0}
        onChanged={() => void refetch()}
      />
      <TestimonialPanel
        testimonials={testimonials}
        loading={loading && !data}
        loadFailed={Boolean(error) && testimonials.length === 0}
        onChanged={() => void refetch()}
      />
    </div>
  );
}

function FaqPanel({
  faqs,
  loading,
  loadFailed,
  onChanged,
}: {
  faqs: FaqEntry[];
  loading: boolean;
  loadFailed: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations('Admin.marketing');

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">{t('faqTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('faqSubtitle')}</p>
        </div>
        <FaqDialog
          onSaved={onChanged}
          trigger={
            <Button size="sm" variant="accent">
              <Plus aria-hidden="true" />
              {t('addFaq')}
            </Button>
          }
        />
      </div>

      {loading ? (
        <ListSkeleton rows={4} label={t('loadingFaqs')} />
      ) : loadFailed ? (
        <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
          {t('loadError')}
        </p>
      ) : faqs.length === 0 ? (
        <EmptyState variant="inline" title={t('noFaqs')} description={t('noFaqsHint')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {faqs.map((faq, index) => (
            <li
              key={faq.id}
              className="flex items-start gap-3 rounded-card border border-border bg-surface p-4"
            >
              <ReorderButtons
                index={index}
                total={faqs.length}
                onMove={async (direction) => {
                  const order = moveWithin(faqs, faq.id, direction);
                  if (order) {
                    await reorderFaqs(order);
                    onChanged();
                  }
                }}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{faq.questionEn}</span>
                  {!faq.isPublished && <StatusBadge tone="neutral" size="sm" label={t('draft')} />}
                  {faq.category && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {faq.category}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{faq.questionFr}</p>
              </div>

              <RowActions
                editDialog={
                  <FaqDialog
                    faq={faq}
                    onSaved={onChanged}
                    trigger={
                      <Button size="icon" variant="ghost" aria-label={t('edit')}>
                        <Pencil aria-hidden="true" />
                      </Button>
                    }
                  />
                }
                onDelete={async () => {
                  await deleteFaq(faq.id);
                  onChanged();
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TestimonialPanel({
  testimonials,
  loading,
  loadFailed,
  onChanged,
}: {
  testimonials: TestimonialEntry[];
  loading: boolean;
  loadFailed: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations('Admin.marketing');

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            {t('testimonialsTitle')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('testimonialsSubtitle')}</p>
        </div>
        <TestimonialDialog
          onSaved={onChanged}
          trigger={
            <Button size="sm" variant="accent">
              <Plus aria-hidden="true" />
              {t('addTestimonial')}
            </Button>
          }
        />
      </div>

      {loading ? (
        <ListSkeleton rows={4} label={t('loadingTestimonials')} />
      ) : loadFailed ? (
        <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
          {t('loadError')}
        </p>
      ) : testimonials.length === 0 ? (
        <EmptyState
          variant="inline"
          icon={<MessageSquareQuote aria-hidden="true" />}
          title={t('noTestimonials')}
          description={t('noTestimonialsHint')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {testimonials.map((testimonial, index) => (
            <li
              key={testimonial.id}
              className="flex items-start gap-3 rounded-card border border-border bg-surface p-4"
            >
              <ReorderButtons
                index={index}
                total={testimonials.length}
                onMove={async (direction) => {
                  const order = moveWithin(testimonials, testimonial.id, direction);
                  if (order) {
                    await reorderTestimonials(order);
                    onChanged();
                  }
                }}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{testimonial.author}</span>
                  <span className="inline-flex items-center gap-1 font-numeric text-xs text-warning">
                    <Star aria-hidden="true" className="size-3.5 fill-warning" />
                    {testimonial.rating.toFixed(1)}
                  </span>
                  {!testimonial.visible && (
                    <StatusBadge tone="neutral" size="sm" label={t('hidden')} />
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {testimonial.roleEn} · {testimonial.contentEn}
                </p>
              </div>

              <RowActions
                editDialog={
                  <TestimonialDialog
                    testimonial={testimonial}
                    onSaved={onChanged}
                    trigger={
                      <Button size="icon" variant="ghost" aria-label={t('edit')}>
                        <Pencil aria-hidden="true" />
                      </Button>
                    }
                  />
                }
                onDelete={async () => {
                  await deleteTestimonial(testimonial.id);
                  onChanged();
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReorderButtons({
  index,
  total,
  onMove,
}: {
  index: number;
  total: number;
  onMove: (direction: 'up' | 'down') => Promise<void>;
}) {
  const t = useTranslations('Admin.marketing');
  const [working, setWorking] = useState(false);

  const move = async (direction: 'up' | 'down') => {
    setWorking(true);
    try {
      await onMove(direction);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-label={t('moveUp')}
        disabled={index === 0 || working}
        onClick={() => void move('up')}
        className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowUp className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t('moveDown')}
        disabled={index === total - 1 || working}
        onClick={() => void move('down')}
        className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowDown className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The edit dialog plus a confirm-gated delete. Delete is REAL here (unlike the
 * taxonomy's retire) — nothing references these rows — so it asks first, because
 * a one-click permanent delete on a list is how the wrong testimonial vanishes.
 */
function RowActions({
  editDialog,
  onDelete,
}: {
  editDialog: React.ReactNode;
  onDelete: () => Promise<void>;
}) {
  const t = useTranslations('Admin.marketing');
  const translateError = useAuthErrorMessage();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setWorking(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(translateError(err));
      setConfirming(false);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {editDialog}

      {confirming ? (
        <span className="flex items-center gap-1">
          <Button size="sm" variant="danger" disabled={working} onClick={() => void remove()}>
            {working ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t('confirmDelete')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            {t('cancel')}
          </Button>
        </span>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('delete')}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
