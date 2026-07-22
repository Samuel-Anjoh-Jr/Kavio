'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { MessageSquare, Search } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { RemoteImage } from '@/components/ui/remote-image';
import { RequireAuthNotice } from '@/components/messaging/require-auth-notice';
import { formatDayLabel } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import {
  CONVERSATIONS_QUERY,
  type ConversationsQueryResult,
  type Conversation,
} from '@/lib/graphql/messaging';
import {
  conversationMatchesFilter,
  conversationMatchesQuery,
  INBOX_FILTERS,
  type InboxFilter,
} from '@/lib/messaging';

/**
 * The messaging inbox (MSG-01): filters (All/Clients/System/Offers), search,
 * unread counts, and presence dots. Reads are GraphQL; the list re-renders live
 * as the socket updates individual threads via the Apollo cache.
 *
 * Filters and search are applied on the client over the already-fetched list:
 * an inbox is small (one row per conversation), so a round-trip per keystroke
 * would be latency for no benefit, and search stays instant offline.
 */
export function InboxScreen() {
  const t = useTranslations('Messaging');
  const locale = useLocale();
  const { status } = useSession();

  const { data, loading } = useQuery<ConversationsQueryResult>(CONVERSATIONS_QUERY, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    skip: status !== 'authenticated',
  });

  const [filter, setFilter] = useState<InboxFilter>('ALL');
  const [query, setQuery] = useState('');

  // Memoised because `?? []` allocates a fresh array on every render, which would
  // invalidate the filter/count memos below each time and re-sort the whole inbox.
  const conversations = useMemo(() => data?.myConversations ?? [], [data]);

  const filtered = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          conversationMatchesFilter(conversation, filter) &&
          conversationMatchesQuery(conversation, query),
      ),
    [conversations, filter, query],
  );

  const unreadByFilter = useMemo(() => {
    const counts: Record<InboxFilter, number> = { ALL: 0, CLIENTS: 0, SYSTEM: 0, OFFERS: 0 };
    for (const conversation of conversations) {
      for (const key of INBOX_FILTERS) {
        if (conversationMatchesFilter(conversation, key)) {
          counts[key] += conversation.unreadCount;
        }
      }
    }
    return counts;
  }, [conversations]);

  // The inbox is personal; a guest is invited to sign in rather than shown an
  // empty list they cannot fill (ACC-02).
  if (status === 'unauthenticated') {
    return <RequireAuthNotice />;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {t('inboxTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('inboxSubtitle')}</p>
      </div>

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="w-full rounded-input border border-input bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t('filters')}>
        {INBOX_FILTERS.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              filter === key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-surface text-muted-foreground hover:bg-muted',
            )}
          >
            {t(`filter.${key}`)}
            {unreadByFilter[key] > 0 && (
              <span
                className={cn(
                  'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-numeric tabular-nums',
                  filter === key ? 'bg-primary-foreground/20' : 'bg-primary/15 text-primary',
                )}
              >
                {unreadByFilter[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && conversations.length === 0 ? (
        <InboxSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyInbox hasAny={conversations.length > 0} filter={filter} />
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border">
          {filtered.map((conversation) => (
            <ConversationRow key={conversation.id} conversation={conversation} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ConversationRow({ conversation, locale }: { conversation: Conversation; locale: string }) {
  const t = useTranslations('Messaging');
  const hasUnread = conversation.unreadCount > 0;

  return (
    <li>
      <Link
        href={`/app/messages/${conversation.id}`}
        className="flex items-center gap-3 bg-surface px-4 py-3 transition-colors hover:bg-muted"
      >
        <span className="relative shrink-0">
          {conversation.peer?.avatar ? (
            <RemoteImage
              src={conversation.peer.avatar}
              alt=""
              className="size-11 rounded-full object-cover"
            />
          ) : (
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageSquare aria-hidden className="size-5" />
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'truncate text-sm',
                hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground',
              )}
            >
              {conversation.peer?.name ?? t('systemThread')}
            </span>
            {conversation.lastMessageAt && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDayLabel(conversation.lastMessageAt, locale, {
                  today: t('day.today'),
                  yesterday: t('day.yesterday'),
                })}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'truncate text-sm',
                hasUnread ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {conversation.jobTitle && (
                <span className="text-primary">{conversation.jobTitle} · </span>
              )}
              {conversation.lastMessagePreview ?? t('noMessagesYet')}
            </span>
            {hasUnread && (
              <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-numeric tabular-nums text-primary-foreground">
                {conversation.unreadCount}
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function EmptyInbox({ hasAny, filter }: { hasAny: boolean; filter: InboxFilter }) {
  const t = useTranslations('Messaging');
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-16 text-center">
      <MessageSquare aria-hidden className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">
        {hasAny ? t(`empty.filter.${filter}`) : t('empty.inboxTitle')}
      </p>
      <p className="max-w-xs text-sm text-muted-foreground">
        {hasAny ? t('empty.filterBody') : t('empty.inboxBody')}
      </p>
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-card border border-border p-4">
          <Skeleton className="size-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
