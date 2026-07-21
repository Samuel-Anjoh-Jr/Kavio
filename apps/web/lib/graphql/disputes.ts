import { gql } from '@apollo/client';
import type { DisputeResolution, DisputeStatus } from '@/lib/disputes';

/**
 * Dispute READS (DUAL API RULE). Writes are REST (lib/rest-api).
 *
 * Delivered by PROMPT 68 in a parallel lane. The parties' dispute view (PROMPT
 * 69) is built against this contract and renders a friendly pending state until
 * the resolver answers.
 */

export interface DisputeMessage {
  id: string;
  authorId: string;
  authorName: string | null;
  authorRole: string | null;
  body: string;
  createdAt: string;
}

export interface DisputeEvidence {
  id: string;
  caption: string | null;
  url: string | null;
  mimeType: string | null;
  uploadedById: string | null;
  createdAt: string;
}

export interface DisputeEvent {
  id: string;
  type: string;
  note: string | null;
  createdAt: string;
}

export interface DisputeDetail {
  id: string;
  jobId: string;
  jobTitle: string | null;
  bookingId: string | null;
  openedById: string;
  openedByName: string | null;
  reason: string;
  status: DisputeStatus;
  resolution: DisputeResolution | null;
  resolutionNote: string | null;
  escrowFrozen: boolean;
  amountInEscrow: number | null;
  messages: DisputeMessage[];
  evidence: DisputeEvidence[];
  timeline: DisputeEvent[];
  createdAt: string;
  resolvedAt: string | null;
}

export const DISPUTE_QUERY = gql`
  query Dispute($id: ID!) {
    dispute(id: $id) {
      id
      jobId
      jobTitle
      bookingId
      openedById
      openedByName
      reason
      status
      resolution
      resolutionNote
      escrowFrozen
      amountInEscrow
      messages {
        id
        authorId
        authorName
        authorRole
        body
        createdAt
      }
      evidence {
        id
        caption
        url
        mimeType
        uploadedById
        createdAt
      }
      timeline {
        id
        type
        note
        createdAt
      }
      createdAt
      resolvedAt
    }
  }
`;

export interface DisputeQueryResult {
  dispute: DisputeDetail | null;
}
