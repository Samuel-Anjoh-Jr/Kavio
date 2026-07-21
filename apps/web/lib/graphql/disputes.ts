import { gql } from '@apollo/client';
import type { DisputeResolution, DisputeStatus } from '@/lib/disputes';

/**
 * Dispute READS (DUAL API RULE). Writes are REST (lib/rest-api).
 *
 * Mirrors apps/api/src/payments/models/payments.model.ts#DisputeView. Evidence
 * is not a separate entity: it rides on messages as attachments, so the thread
 * IS the record. The `dispute(id)` read resolves only for the two parties (and
 * a resolving admin); it is never public.
 */

export interface DisputeAttachment {
  id: string;
  url: string | null;
}

export interface DisputeMessage {
  id: string;
  authorId: string;
  body: string;
  attachments: DisputeAttachment[];
  createdAt: string;
}

export interface DisputeDetail {
  id: string;
  jobId: string;
  bookingId: string;
  openedById: string;
  reason: string;
  status: DisputeStatus;
  resolution: DisputeResolution | null;
  resolutionNote: string | null;
  messages: DisputeMessage[];
  createdAt: string;
}

export const DISPUTE_QUERY = gql`
  query Dispute($id: ID!) {
    dispute(id: $id) {
      id
      jobId
      bookingId
      openedById
      reason
      status
      resolution
      resolutionNote
      messages {
        id
        authorId
        body
        attachments {
          id
          url
        }
        createdAt
      }
      createdAt
    }
  }
`;

export interface DisputeQueryResult {
  dispute: DisputeDetail | null;
}

/**
 * The admin dispute queue (ADM-05). Admin-only server-side. Kept light — the
 * board needs a card per dispute, not the full thread, so only message ids come
 * back (for the count). Mirrors payments.resolver.ts#disputeQueue.
 */
export const DISPUTE_QUEUE_QUERY = gql`
  query DisputeQueue($status: DisputeStatus) {
    disputeQueue(status: $status) {
      id
      jobId
      bookingId
      openedById
      reason
      status
      resolution
      resolutionNote
      createdAt
      messages {
        id
      }
    }
  }
`;

export interface DisputeQueueItem {
  id: string;
  jobId: string;
  bookingId: string;
  openedById: string;
  reason: string;
  status: DisputeStatus;
  resolution: DisputeResolution | null;
  resolutionNote: string | null;
  createdAt: string;
  messages: { id: string }[];
}

export interface DisputeQueueQueryResult {
  disputeQueue: DisputeQueueItem[];
}
