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
 * The admin dispute workspace (ADM-05). Admin-gated, NOT party-scoped — an
 * admin resolving a case is not one of its two sides, unlike `dispute` above.
 * Mirrors payments.resolver.ts#adminDispute / AdminDisputeView.
 */
export interface DisputeHistoryEntry {
  kind: string;
  labelKey: string;
  actorId: string | null;
  escrowState: string | null;
  note: string | null;
  occurredAt: string;
}

export interface AdminDisputeDetail extends DisputeDetail {
  clientId: string;
  workerId: string;
  jobTitle: string | null;
  faultParty: 'CLIENT' | 'NONE' | 'WORKER';
  resolvedAt: string | null;
  escrowAmount: number | null;
  escrowState: string | null;
  history: DisputeHistoryEntry[];
}

export const ADMIN_DISPUTE_QUERY = gql`
  query AdminDispute($id: ID!) {
    adminDispute(id: $id) {
      id
      jobId
      jobTitle
      bookingId
      openedById
      clientId
      workerId
      reason
      status
      resolution
      resolutionNote
      faultParty
      resolvedAt
      escrowAmount
      escrowState
      history {
        kind
        labelKey
        actorId
        escrowState
        note
        occurredAt
      }
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

export interface AdminDisputeQueryResult {
  adminDispute: AdminDisputeDetail | null;
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
