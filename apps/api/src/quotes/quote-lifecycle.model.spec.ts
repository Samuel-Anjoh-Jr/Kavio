import { QuoteStatus } from '@trustpro/database';
import {
  canTransitionQuote,
  isQuoteTransitionAllowedFor,
  isTerminalQuoteStatus,
  QUOTE_TRANSITIONS,
  TERMINAL_QUOTE_STATUSES,
} from './quote-lifecycle.model';

describe('quote lifecycle state machine (QTE-03)', () => {
  it('covers every QuoteStatus', () => {
    for (const status of Object.values(QuoteStatus)) {
      expect(QUOTE_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('walks Draft → Sent → Viewed → Accepted', () => {
    expect(canTransitionQuote(QuoteStatus.DRAFT, QuoteStatus.SENT)).toBe(true);
    expect(canTransitionQuote(QuoteStatus.SENT, QuoteStatus.VIEWED)).toBe(true);
    expect(canTransitionQuote(QuoteStatus.VIEWED, QuoteStatus.ACCEPTED)).toBe(true);
  });

  it('lets a client accept a sent quote without first viewing it', () => {
    // Opening an email client that fetches the quote and acting are not always
    // ordered; accept must be reachable straight from SENT.
    expect(canTransitionQuote(QuoteStatus.SENT, QuoteStatus.ACCEPTED)).toBe(true);
  });

  it('treats Accepted, Declined and Expired as terminal', () => {
    expect(isTerminalQuoteStatus(QuoteStatus.ACCEPTED)).toBe(true);
    expect(isTerminalQuoteStatus(QuoteStatus.DECLINED)).toBe(true);
    expect(isTerminalQuoteStatus(QuoteStatus.EXPIRED)).toBe(true);
    expect(TERMINAL_QUOTE_STATUSES).toHaveLength(3);
  });

  it('does not reopen a declined or accepted quote', () => {
    expect(canTransitionQuote(QuoteStatus.DECLINED, QuoteStatus.SENT)).toBe(false);
    expect(canTransitionQuote(QuoteStatus.ACCEPTED, QuoteStatus.DECLINED)).toBe(false);
  });

  it('reserves sending to the worker and responding to the client', () => {
    expect(isQuoteTransitionAllowedFor(QuoteStatus.DRAFT, QuoteStatus.SENT, 'WORKER')).toBe(true);
    expect(isQuoteTransitionAllowedFor(QuoteStatus.DRAFT, QuoteStatus.SENT, 'CLIENT')).toBe(false);
    expect(isQuoteTransitionAllowedFor(QuoteStatus.SENT, QuoteStatus.ACCEPTED, 'CLIENT')).toBe(
      true,
    );
    expect(isQuoteTransitionAllowedFor(QuoteStatus.SENT, QuoteStatus.ACCEPTED, 'WORKER')).toBe(
      false,
    );
  });

  it('lets only the system expire a quote', () => {
    expect(isQuoteTransitionAllowedFor(QuoteStatus.SENT, QuoteStatus.EXPIRED, 'CLIENT')).toBe(
      false,
    );
    expect(isQuoteTransitionAllowedFor(QuoteStatus.SENT, QuoteStatus.EXPIRED, 'SYSTEM')).toBe(true);
  });
});
