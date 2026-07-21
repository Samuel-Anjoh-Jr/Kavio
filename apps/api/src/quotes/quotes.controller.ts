import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { BookingsService } from './bookings.service';
import {
  createQuoteSchema,
  declineQuoteSchema,
  requestCounterSchema,
  reviseQuoteSchema,
  updateQuoteSchema,
  type CreateQuoteDto,
  type DeclineQuoteDto,
  type RequestCounterDto,
  type ReviseQuoteDto,
  type UpdateQuoteDto,
} from './dto/quote.dto';
import { QuotesService } from './quotes.service';

/**
 * Quote & booking WRITES (REST, per the DUAL API RULE). Reads are on
 * QuotesResolver.
 *
 * The capabilities keep the two sides apart:
 *   quote:create   — a WORKER authoring, sending and revising quotes
 *   quote:respond  — a CLIENT viewing, declining, countering and ACCEPTING
 *
 * Accepting is a `quote:respond` action even though it moves money, because the
 * client is responding to an offer; the escrow it initiates is the consequence,
 * not the authorisation.
 */
@Controller()
export class QuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly bookings: BookingsService,
  ) {}

  // ── Worker side (QTE-01, QTE-03) ────────────────────────────────────────────

  @Post('jobs/:jobId/quotes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('quote:create')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body(new ZodValidationPipe(createQuoteSchema)) dto: CreateQuoteDto,
  ) {
    return this.quotes.create(user, jobId, dto);
  }

  @Patch('quotes/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('quote:create')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateQuoteSchema)) dto: UpdateQuoteDto,
  ) {
    return this.quotes.update(user, id, dto);
  }

  @Post('quotes/:id/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('quote:create')
  async send(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.quotes.send(user, id);
  }

  /** A worker's counter-offer: a new quote chained to the one it revises (QTE-03). */
  @Post('quotes/:id/revise')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('quote:create')
  async revise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(reviseQuoteSchema)) dto: ReviseQuoteDto,
  ) {
    return this.quotes.revise(user, id, dto);
  }

  // ── Client side (QTE-02, QTE-03) ────────────────────────────────────────────

  @Post('quotes/:id/view')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('quote:respond')
  async markViewed(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.quotes.markViewed(user, id);
  }

  @Post('quotes/:id/decline')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('quote:respond')
  async decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(declineQuoteSchema)) dto: DeclineQuoteDto,
  ) {
    return this.quotes.decline(user, id, dto);
  }

  @Post('quotes/:id/request-counter')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('quote:respond')
  async requestCounter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(requestCounterSchema)) dto: RequestCounterDto,
  ) {
    return this.quotes.requestCounter(user, id, dto);
  }

  /**
   * Accepting a quote (QTE-03). Creates the booking at the agreed price and
   * requests escrow initiation — the entry point for PAY-01.
   */
  @Post('quotes/:id/accept')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('quote:respond')
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.bookings.acceptQuote(user, id);
  }
}
