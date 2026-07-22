'use client';

import { restDelete, restPost, restUpload, type UploadResult } from '@/lib/rest-api';
import type { Message, MessageKind } from '@/lib/graphql/messaging';

/**
 * Messaging WRITES + shared vocabulary (MSG-01…MSG-03). Reads are GraphQL.
 */

/** Inbox filters (MSG-01). */
export type InboxFilter = 'ALL' | 'CLIENTS' | 'SYSTEM' | 'OFFERS';

export const INBOX_FILTERS: readonly InboxFilter[] = ['ALL', 'CLIENTS', 'SYSTEM', 'OFFERS'];

/** Why a conversation can be reported (MSG-04). Mirrors AbuseReportReason. */
export const REPORT_REASONS = [
  'SPAM',
  'HARASSMENT',
  'SCAM',
  'INAPPROPRIATE',
  'OFF_PLATFORM',
  'FAKE_PROFILE',
  'STOLEN_CONTENT',
  'MISLEADING',
  'ILLEGAL',
  'OTHER',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export interface SendMessageInput {
  kind?: MessageKind;
  body?: string;
  attachmentAssetIds?: string[];
  latitude?: number;
  longitude?: number;
  refId?: string;
  clientRef?: string;
}

export function startConversation(input: {
  recipientId: string;
  jobId?: string;
  message?: string;
}): Promise<{ id: string }> {
  return restPost<{ id: string }>('conversations', input);
}

export function sendMessage(conversationId: string, input: SendMessageInput): Promise<Message> {
  return restPost<Message>(`conversations/${conversationId}/messages`, input);
}

export function markConversationRead(conversationId: string): Promise<{ updated: number }> {
  return restPost<{ updated: number }>(`conversations/${conversationId}/read`);
}

export function blockUser(userId: string, reason?: string): Promise<{ id: string }> {
  return restPost<{ id: string }>('messaging/block', { userId, ...(reason ? { reason } : {}) });
}

export function unblockUser(userId: string): Promise<{ removed: number }> {
  return restDelete<{ removed: number }>(`messaging/block/${userId}`);
}

/** Uploads a chat image or voice note, returning the asset to attach. */
export function uploadMessageMedia(
  file: File,
  kind: 'MESSAGE_IMAGE' | 'MESSAGE_VOICE',
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  return restUpload('uploads', file, { kind }, onProgress);
}

/**
 * Which inbox filter a conversation belongs to (MSG-01).
 *
 * Deliberately derived on the client from data the list already has, rather than
 * being a stored column: a thread's "kind" is a view of it, not a fact about it,
 * and the same thread is legitimately an Offer while a quote is live and a plain
 * Client conversation afterwards.
 */
export function conversationMatchesFilter(
  conversation: { jobId: string | null; peer: { id: string } | null },
  filter: InboxFilter,
): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    // A thread with no human peer is the platform talking to you.
    case 'SYSTEM':
      return conversation.peer === null;
    // Job-linked threads are live negotiations.
    case 'OFFERS':
      return conversation.jobId !== null && conversation.peer !== null;
    case 'CLIENTS':
      return conversation.peer !== null;
    default:
      return true;
  }
}

/** Case-insensitive search over the peer name, job title and last message. */
export function conversationMatchesQuery(
  conversation: {
    peer: { name: string | null } | null;
    jobTitle: string | null;
    lastMessagePreview: string | null;
  },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [conversation.peer?.name, conversation.jobTitle, conversation.lastMessagePreview].some(
    (value) => value?.toLowerCase().includes(needle),
  );
}

/**
 * Merges the live socket feed into the page fetched over GraphQL.
 *
 * Deduplicated by id because the two overlap by design: a message sent while the
 * thread is open arrives on the socket AND is in the next refetch, and rendering
 * it twice is the most visible bug a chat can have.
 */
export function mergeLiveMessages<T extends { id: string; createdAt: string }>(
  fetched: T[],
  live: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const message of [...fetched, ...live]) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}
