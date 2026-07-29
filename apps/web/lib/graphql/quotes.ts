import { gql } from '@apollo/client';
import type { BookingStatus, QuoteDurationUnit, QuoteStatus } from '@/lib/quotes';
import type { WorkerPreview } from './jobs';

/**
 * Quote & booking READS (DUAL API RULE). Writes are REST (lib/rest-api).
 *
 * Nothing here is public: a quote is a private negotiation and a booking is a
 * financial record. Each query resolves only rows the viewer is a party to,
 * enforced server-side. Mirrors apps/api/src/quotes/quotes.resolver.ts.
 */

export interface QuoteAttachment {
  id: string;
  url: string | null;
}

export interface Quote {
  id: string;
  jobId: string;
  jobTitle: string | null;
  workerId: string;
  price: number;
  durationValue: number | null;
  durationUnit: QuoteDurationUnit | null;
  includes: string[];
  message: string | null;
  status: QuoteStatus;
  /** Current admin-configured platform fee, in basis points (PAY-01). */
  platformFeeBps: number;
  attachments: QuoteAttachment[];
  worker: WorkerPreview | null;
  parentQuoteId: string | null;
  counterTargetPrice: number | null;
  counterMessage: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface Booking {
  id: string;
  jobId: string;
  jobTitle: string | null;
  quoteId: string;
  workerId: string;
  clientId: string;
  agreedPrice: number;
  platformFeeAmount: number;
  workerPayoutAmount: number;
  status: BookingStatus;
  createdAt: string;
}

const QUOTE_FIELDS = `
  id
  jobId
  jobTitle
  workerId
  price
  durationValue
  durationUnit
  includes
  message
  status
  platformFeeBps
  attachments {
    id
    url
  }
  worker {
    workerId
    name
    avatar
    headline
    city
    tier
    trustScore
    completedJobs
    averageRating
  }
  parentQuoteId
  counterTargetPrice
  counterMessage
  sentAt
  viewedAt
  expiresAt
  createdAt
`;

/** The worker's quote inbox: Sent and Drafts (QTE-04). */
export const MY_QUOTES_QUERY = gql`
  query MyQuotes {
    myQuotes {
      sent {
        ${QUOTE_FIELDS}
      }
      drafts {
        ${QUOTE_FIELDS}
      }
    }
  }
`;

export interface MyQuotesQueryResult {
  myQuotes: {
    sent: Quote[];
    drafts: Quote[];
  };
}

/** The quotes a client received on one of their jobs, with worker context (QTE-02). */
export const JOB_QUOTES_QUERY = gql`
  query JobQuotes($jobId: ID!) {
    jobQuotes(jobId: $jobId) {
      ${QUOTE_FIELDS}
    }
  }
`;

export interface JobQuotesQueryResult {
  jobQuotes: Quote[];
}

/**
 * Every quote the client received across all their jobs, newest first (QTE-02).
 *
 * The Received inbox reads this ONE aggregate and groups by job client-side,
 * rather than firing a jobQuotes round trip per job. Mirrors
 * apps/api/src/quotes/quotes-read.service.ts#receivedQuotes.
 */
export const RECEIVED_QUOTES_QUERY = gql`
  query ReceivedQuotes {
    receivedQuotes {
      ${QUOTE_FIELDS}
    }
  }
`;

export interface ReceivedQuotesQueryResult {
  receivedQuotes: Quote[];
}

/** One quote, for the worker who sent it or the client it went to. */
export const QUOTE_QUERY = gql`
  query Quote($id: ID!) {
    quote(id: $id) {
      ${QUOTE_FIELDS}
    }
  }
`;

export interface QuoteQueryResult {
  quote: Quote | null;
}

/** The caller's bookings, as worker or client (QTE-04, PAY-01). */
export const MY_BOOKINGS_QUERY = gql`
  query MyBookings {
    myBookings {
      id
      jobId
      jobTitle
      quoteId
      workerId
      clientId
      agreedPrice
      platformFeeAmount
      workerPayoutAmount
      status
      createdAt
    }
  }
`;

export interface MyBookingsQueryResult {
  myBookings: Booking[];
}
