'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ImagePlus, Loader2, MoreVertical, Send, ShieldAlert, Ban } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { ReportDialog } from '@/components/moderation/report-dialog';
import { formatDayLabel } from '@/lib/datetime';
import { ApiError } from '@/lib/api-error';
import {
  CONVERSATION_QUERY,
  type ConversationQueryResult,
  type Message,
} from '@/lib/graphql/messaging';
import {
  blockUser,
  mergeLiveMessages,
  sendMessage,
  uploadMessageMedia,
  type SendMessageInput,
} from '@/lib/messaging';
import { useConversation, type LiveMessage } from '@/lib/realtime/use-conversation';
import { MessageBubble } from './message-bubble';
import { VoiceRecorder } from './voice-recorder';

/**
 * The conversation view (MSG-01, MSG-02, MSG-03).
 *
 * Reads come from GraphQL (the initial page) and the live socket (everything
 * after mount); they are merged and deduplicated by id, because a message sent
 * while the thread is open arrives on both. Writes are REST — sending a message
 * is the DUAL API RULE in miniature: POST to create it, and the socket carries
 * the peer's reply back. Typing and presence come off the socket.
 */
export function ConversationScreen({ conversationId }: { conversationId: string }) {
  const t = useTranslations('Messaging');
  const locale = useLocale();
  const { toast } = useToast();
  const { data: session } = useSession();

  const viewerId = session?.user?.id ?? null;
  const token = session?.accessToken ?? null;

  const { data, loading, refetch } = useQuery<ConversationQueryResult>(CONVERSATION_QUERY, {
    variables: { id: conversationId, limit: 50 },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const live = useConversation(conversationId, token);
  const [composerMode, setComposerMode] = useState<'text' | 'voice'>('text');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const thread = data?.conversation;
  const peer = thread?.conversation.peer ?? null;

  // The fetched page plus everything the socket has delivered since mount, one
  // list, deduplicated and time-ordered.
  const messages = useMemo(() => {
    const fetched = thread?.messages ?? [];
    const liveAsMessages = live.liveMessages.map(fromLive);
    return mergeLiveMessages(fetched, liveAsMessages);
  }, [thread?.messages, live.liveMessages]);

  // Follow the conversation to the bottom on new content — the expected chat
  // behaviour, and cheap because the anchor is a zero-height sentinel.
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // Reading the thread marks it read (server-side + over the socket), so the
  // inbox badge clears the moment it is opened.
  useEffect(() => {
    if (thread) live.markRead();
    // Only when the thread identity changes, not on every socket tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, Boolean(thread)]);

  const peerOnline = peer ? live.onlineUserIds.includes(peer.id) : false;
  const peerTyping = peer ? live.typingUserIds.includes(peer.id) : false;

  const doSend = useCallback(
    async (input: SendMessageInput) => {
      setSending(true);
      try {
        await sendMessage(conversationId, input);
        setDraft('');
        setComposerMode('text');
        await refetch();
      } catch (error) {
        toast({
          variant: 'danger',
          title: t('sendFailed'),
          description: error instanceof ApiError ? error.message : undefined,
        });
      } finally {
        setSending(false);
      }
    },
    [conversationId, refetch, t, toast],
  );

  const sendText = useCallback(() => {
    const body = draft.trim();
    if (!body || sending) return;
    void doSend({ kind: 'TEXT', body });
  }, [draft, sending, doSend]);

  const sendImage = useCallback(
    async (file: File) => {
      setSending(true);
      try {
        const asset = await uploadMessageMedia(file, 'MESSAGE_IMAGE');
        await sendMessage(conversationId, { kind: 'IMAGE', attachmentAssetIds: [asset.id] });
        await refetch();
      } catch (error) {
        toast({
          variant: 'danger',
          title: t('uploadFailed'),
          description: error instanceof ApiError ? error.message : undefined,
        });
      } finally {
        setSending(false);
      }
    },
    [conversationId, refetch, t, toast],
  );

  const sendVoice = useCallback(
    async (file: File) => {
      setSending(true);
      try {
        const asset = await uploadMessageMedia(file, 'MESSAGE_VOICE');
        await sendMessage(conversationId, { kind: 'VOICE', attachmentAssetIds: [asset.id] });
        setComposerMode('text');
        await refetch();
      } catch (error) {
        toast({
          variant: 'danger',
          title: t('uploadFailed'),
          description: error instanceof ApiError ? error.message : undefined,
        });
      } finally {
        setSending(false);
      }
    },
    [conversationId, refetch, t, toast],
  );

  const onBlock = useCallback(async () => {
    if (!peer) return;
    try {
      await blockUser(peer.id);
      toast({ title: t('blocked') });
      await refetch();
    } catch (error) {
      toast({
        variant: 'danger',
        title: t('actionFailed'),
        description: error instanceof ApiError ? error.message : undefined,
      });
    }
  }, [peer, refetch, t, toast]);

  if (loading && !thread) return <ConversationSkeleton />;

  if (!thread) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t('notFound')}</p>
        <Button asChild variant="outline">
          <Link href="/app/messages">{t('backToInbox')}</Link>
        </Button>
      </div>
    );
  }

  const grouped = groupByDay(messages);

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button asChild variant="ghost" size="icon" className="xl:hidden">
          <Link href="/app/messages" aria-label={t('backToInbox')}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-heading text-base font-semibold text-foreground">
              {peer?.name ?? t('systemThread')}
            </h1>
            {peerOnline && (
              <span
                className="size-2 shrink-0 rounded-full bg-success"
                aria-label={t('presence.online')}
              />
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {peerTyping
              ? t('presence.typing')
              : peerOnline
                ? t('presence.online')
                : thread.conversation.jobTitle
                  ? thread.conversation.jobTitle
                  : t('presence.offline')}
          </p>
        </div>

        {peer && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t('menu.open')}
              className="inline-flex size-10 items-center justify-center rounded-button text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreVertical aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <ReportDialog
                targetType="CONVERSATION"
                targetId={conversationId}
                reportedUserId={peer.id}
                trigger={
                  <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                    <ShieldAlert aria-hidden className="mr-2 size-4" />
                    {t('menu.report')}
                  </DropdownMenuItem>
                }
              />
              <DropdownMenuItem onSelect={() => void onBlock()}>
                <Ban aria-hidden className="mr-2 size-4" />
                {thread.conversation.peerBlocked ? t('menu.blocked') : t('menu.block')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* Thread */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-foreground">{t('empty.threadTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('empty.threadBody')}</p>
          </div>
        ) : (
          grouped.map(({ day, items }) => (
            <div key={day} className="space-y-3">
              <div className="flex justify-center">
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {formatDayLabel(items[0]!.createdAt, locale, {
                    today: t('day.today'),
                    yesterday: t('day.yesterday'),
                  })}
                </span>
              </div>
              {items.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  own={message.senderId === viewerId}
                />
              ))}
            </div>
          ))
        )}
        <div ref={scrollAnchorRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3">
        {thread.conversation.peerBlocked ? (
          <p className="py-2 text-center text-sm text-muted-foreground">{t('blockedNotice')}</p>
        ) : composerMode === 'voice' ? (
          <VoiceRecorder
            onRecorded={(file) => void sendVoice(file)}
            onCancel={() => setComposerMode('text')}
            sending={sending}
          />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              sendText();
            }}
            className="flex items-end gap-2"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void sendImage(file);
                event.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('attachImage')}
              disabled={sending}
            >
              <ImagePlus aria-hidden />
            </Button>
            <textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                live.setTyping(event.target.value.length > 0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendText();
                }
              }}
              onBlur={() => live.setTyping(false)}
              placeholder={t('composerPlaceholder')}
              rows={1}
              className="max-h-32 flex-1 resize-none rounded-input border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {draft.trim() ? (
              <Button type="submit" size="icon" aria-label={t('send')} disabled={sending}>
                {sending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setComposerMode('voice')}
                aria-label={t('voice.record')}
                disabled={sending}
              >
                <span className="text-danger">●</span>
              </Button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

/** The socket's lighter LiveMessage into the full Message shape the bubble wants. */
function fromLive(live: LiveMessage): Message {
  return {
    id: live.id,
    conversationId: live.conversationId,
    senderId: live.senderId,
    kind: live.kind as Message['kind'],
    body: live.body,
    status: live.status as Message['status'],
    mediaUrl: null,
    attachments: [],
    latitude: null,
    longitude: null,
    refId: null,
    deleted: false,
    createdAt: live.createdAt,
  };
}

function groupByDay(messages: Message[]): { day: string; items: Message[] }[] {
  const groups: { day: string; items: Message[] }[] = [];
  for (const message of messages) {
    const day = message.createdAt.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.items.push(message);
    } else {
      groups.push({ day, items: [message] });
    }
  }
  return groups;
}

function ConversationSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex-1 space-y-4 p-4">
        <Skeleton className="h-12 w-48 rounded-card" />
        <Skeleton className="ml-auto h-12 w-56 rounded-card" />
        <Skeleton className="h-16 w-40 rounded-card" />
      </div>
    </div>
  );
}
