'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Loader2, Send } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/lib/api-error';
import { ME_QUERY, type MeQueryResult } from '@/lib/graphql/documents';
import {
  MY_QUOTES_QUERY,
  RECEIVED_QUOTES_QUERY,
  type MyQuotesQueryResult,
  type Quote,
  type ReceivedQuotesQueryResult,
} from '@/lib/graphql/quotes';
import { restPost } from '@/lib/rest-api';
import { QuoteCard } from './quote-card';
import { QuoteClientActions } from './quote-client-actions';
import { QuoteComposer } from './quote-composer';

/**
 * The quote inboxes for both sides of the marketplace (QTE-02, QTE-05).
 *
 * The view is chosen by the ACTIVE role, not the held roles: a worker sees the
 * Sent and Drafts lanes they author; a client sees the quotes Received on their
 * jobs, with the worker context that turns a price into a hiring decision. One
 * identity can be both, and switching role switches inbox — the same rule the
 * rest of the app follows.
 */
export function QuoteInboxesScreen() {
  const t = useTranslations('Quotes');
  const { status } = useSession();

  const { data: meData, loading: meLoading } = useQuery<MeQueryResult>(ME_QUERY, {
    skip: status !== 'authenticated',
  });

  if (status === 'unauthenticated') {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('signInPrompt')}</p>
          <Button asChild>
            <Link href="/auth/login?next=/app/quotes">{t('signIn')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (meLoading || !meData) return <InboxSkeleton />;

  const activeRole = meData.me.activeRole;
  return activeRole === 'WORKER' ? <WorkerInbox /> : <ClientInbox />;
}

// ── Worker: Sent / Drafts ─────────────────────────────────────────────────────

function WorkerInbox() {
  const t = useTranslations('Quotes');
  const { data, loading, refetch } = useQuery<MyQuotesQueryResult>(MY_QUOTES_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) return <InboxSkeleton />;

  const sent = data?.myQuotes.sent ?? [];
  const drafts = data?.myQuotes.drafts ?? [];

  return (
    <Tabs defaultValue="sent">
      <TabsList className="w-full">
        <TabsTrigger value="sent">{t('tabSent', { count: sent.length })}</TabsTrigger>
        <TabsTrigger value="drafts">{t('tabDrafts', { count: drafts.length })}</TabsTrigger>
      </TabsList>

      <TabsContent value="sent" className="mt-6">
        {sent.length === 0 ? (
          <EmptyLane message={t('emptySent')} />
        ) : (
          <div className="flex flex-col gap-4">
            {sent.map((quote) => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                footer={
                  (quote.counterTargetPrice != null || quote.counterMessage != null) &&
                  quote.status !== 'ACCEPTED' &&
                  quote.status !== 'DECLINED' ? (
                    <QuoteComposer
                      quote={quote}
                      mode="revise"
                      onSaved={() => void refetch()}
                      trigger={
                        <Button size="sm" variant="outline">
                          {t('revise')}
                        </Button>
                      }
                    />
                  ) : null
                }
              />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="drafts" className="mt-6">
        {drafts.length === 0 ? (
          <EmptyLane message={t('emptyDrafts')} />
        ) : (
          <div className="flex flex-col gap-4">
            {drafts.map((quote) => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                footer={<WorkerDraftActions quote={quote} onChanged={() => void refetch()} />}
              />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function WorkerDraftActions({ quote, onChanged }: { quote: Quote; onChanged: () => void }) {
  const t = useTranslations('Quotes');
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      await restPost(`quotes/${quote.id}/send`);
      toast({ title: t('sent') });
      onChanged();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : t('saveFailed'),
        variant: 'danger',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <QuoteComposer
        quote={quote}
        mode="edit"
        onSaved={onChanged}
        trigger={
          <Button size="sm" variant="outline">
            {t('edit')}
          </Button>
        }
      />
      <Button size="sm" onClick={() => void send()} disabled={sending}>
        {sending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
        {t('send')}
      </Button>
    </>
  );
}

// ── Client: Received (grouped by job) ─────────────────────────────────────────

function ClientInbox() {
  const t = useTranslations('Quotes');
  const { data, loading, refetch } = useQuery<ReceivedQuotesQueryResult>(RECEIVED_QUOTES_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) return <InboxSkeleton />;

  // One aggregate read, grouped by job on the client — the API stays flat and
  // cheap while the inbox still reads job-by-job. Order (newest first) is
  // preserved from the query.
  const groups: { jobId: string; jobTitle: string | null; quotes: Quote[] }[] = [];
  const indexByJob = new Map<string, number>();
  for (const quote of data?.receivedQuotes ?? []) {
    let at = indexByJob.get(quote.jobId);
    if (at === undefined) {
      at = groups.length;
      indexByJob.set(quote.jobId, at);
      groups.push({ jobId: quote.jobId, jobTitle: quote.jobTitle, quotes: [] });
    }
    groups[at]!.quotes.push(quote);
  }

  return (
    <Tabs defaultValue="received">
      <TabsList className="w-full">
        <TabsTrigger value="received">{t('tabReceived', { count: groups.length })}</TabsTrigger>
      </TabsList>
      <TabsContent value="received" className="mt-6">
        {groups.length === 0 ? (
          <EmptyLane message={t('emptyReceived')} />
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <section key={group.jobId} className="flex flex-col gap-4">
                <h2 className="font-heading text-lg font-semibold text-foreground">
                  {group.jobTitle || t('untitledJob')}
                </h2>
                <div className="flex flex-col gap-4">
                  {group.quotes.map((quote) => (
                    <QuoteCard
                      key={quote.id}
                      quote={quote}
                      showWorker
                      footer={<QuoteClientActions quote={quote} onChanged={() => void refetch()} />}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function EmptyLane({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-44 w-full rounded-card" />
      <Skeleton className="h-44 w-full rounded-card" />
    </div>
  );
}
