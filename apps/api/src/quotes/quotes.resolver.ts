import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { BookingView, QuoteInboxView, QuoteView } from './models/quote.model';
import { QuotesReadService } from './quotes-read.service';

/**
 * Quote & booking READS (GraphQL, per the DUAL API RULE). Writes are on
 * QuotesController.
 *
 * Nothing here is @Public(): a quote is a private negotiation between two
 * parties, and a booking is a financial record. Every query resolves only rows
 * the viewer is a party to — enforced in the service's WHERE, not just by the
 * capability on the field.
 */
@Resolver()
export class QuotesResolver {
  constructor(private readonly read: QuotesReadService) {}

  @RequirePermissions('quote:create')
  @Query(() => QuoteInboxView, {
    description: "The worker's quote inbox: Sent and Drafts (QTE-04).",
  })
  async myQuotes(@CurrentUser() user: AuthenticatedUser): Promise<QuoteInboxView> {
    return this.read.myQuotes(user);
  }

  @RequirePermissions('quote:respond')
  @Query(() => [QuoteView], {
    description: 'The quotes a client received on one of their jobs, with worker context (QTE-02).',
  })
  async jobQuotes(
    @CurrentUser() user: AuthenticatedUser,
    @Args('jobId', { type: () => ID }) jobId: string,
  ): Promise<QuoteView[]> {
    return this.read.jobQuotes(user, jobId);
  }

  @RequirePermissions('quote:respond')
  @Query(() => [QuoteView], {
    description: 'Every quote the client received across all their jobs, newest first (QTE-02).',
  })
  async receivedQuotes(@CurrentUser() user: AuthenticatedUser): Promise<QuoteView[]> {
    return this.read.receivedQuotes(user);
  }

  @Query(() => QuoteView, {
    nullable: true,
    description: 'One quote, visible to the worker who sent it or the client it went to.',
  })
  async quote(
    @CurrentUser() viewer: AuthenticatedUser | undefined,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<QuoteView | null> {
    return this.read.getQuote(id, viewer);
  }

  @Query(() => [BookingView], {
    description: "The caller's bookings, as worker or client (QTE-04, PAY-01).",
  })
  async myBookings(@CurrentUser() user: AuthenticatedUser): Promise<BookingView[]> {
    return this.read.myBookings(user);
  }
}
