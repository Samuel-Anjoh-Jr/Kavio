import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobStatus, MediaAssetKind, QuoteStatus } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import type {
  CreateQuoteDto,
  DeclineQuoteDto,
  RequestCounterDto,
  UpdateQuoteDto,
} from './dto/quote.dto';
import {
  QUOTE_COUNTER_REQUESTED,
  QUOTE_DECLINED,
  QUOTE_SENT,
  QuoteCounterRequestedEvent,
  QuoteDeclinedEvent,
  QuoteSentEvent,
} from './events/quote.events';
import { isQuoteTransitionAllowedFor } from './quote-lifecycle.model';

const logger = createLogger('quotes');

/** A job accepts new quotes while it is still open or already gathering them. */
const QUOTABLE_STATUSES: readonly JobStatus[] = [JobStatus.OPEN, JobStatus.QUOTED];

export interface QuoteRow {
  id: string;
  jobId: string;
  workerId: string;
  price: number;
  status: QuoteStatus;
  includes: string[];
  message: string | null;
  createdAt: Date;
}

const QUOTE_SELECT = {
  id: true,
  jobId: true,
  workerId: true,
  price: true,
  status: true,
  includes: true,
  message: true,
  createdAt: true,
} as const;

/**
 * Quotes: the worker's priced offer and the negotiation around it (PROMPT 59;
 * QTE-01, QTE-02, QTE-03). Writes only — the inboxes are GraphQL reads.
 *
 * The worker authors and sends; the client views, declines, or asks for a
 * counter; ACCEPTING is a booking, handled by BookingsService. Every status move
 * is checked against the pure state machine, and a counter-offer is a NEW quote
 * chained to the one it revises — never an edit — so the price a client saw is
 * always preserved exactly.
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly jobs: JobsService,
  ) {}

  /** A worker composes a quote (QTE-01), optionally sending it immediately. */
  async create(user: AuthenticatedUser, jobId: string, dto: CreateQuoteDto): Promise<QuoteRow> {
    const job = await this.prisma.client.job.findUnique({
      where: { id: jobId },
      select: { id: true, posterId: true, status: true },
    });

    if (!job) {
      throw this.jobNotFound();
    }
    if (job.posterId === user.id) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CANNOT_QUOTE_OWN_JOB',
        'You cannot quote your own job.',
      );
    }
    if (!QUOTABLE_STATUSES.includes(job.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'JOB_NOT_QUOTABLE',
        'This job is no longer accepting quotes.',
      );
    }

    await this.assertApplicationBelongs(dto.applicationId, jobId, user.id);
    const attachmentIds = await this.assertOwnedAttachments(user.id, dto.attachmentAssetIds);

    const sending = dto.send === true;

    const quote = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          jobId,
          workerId: user.id,
          applicationId: dto.applicationId ?? null,
          price: dto.price,
          durationValue: dto.durationValue ?? null,
          durationUnit: dto.durationUnit ?? null,
          includes: dto.includes ?? [],
          message: dto.message ?? null,
          status: sending ? QuoteStatus.SENT : QuoteStatus.DRAFT,
          sentAt: sending ? new Date() : null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
        select: QUOTE_SELECT,
      });

      if (attachmentIds.length > 0) {
        await tx.quoteAttachment.createMany({
          data: attachmentIds.map((mediaAssetId) => ({ quoteId: created.id, mediaAssetId })),
        });
      }

      return created;
    });

    if (sending) {
      await this.onSent(quote.id, jobId, user.id, job.posterId, job.status, quote.price);
    }

    logger.info('Quote created', { payload: { jobId, workerId: user.id, sent: sending } });
    return quote;
  }

  /** Edits a still-DRAFT quote. A sent quote is a standing offer, not editable. */
  async update(user: AuthenticatedUser, quoteId: string, dto: UpdateQuoteDto): Promise<QuoteRow> {
    const quote = await this.requireOwnQuote(quoteId, user.id);
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'QUOTE_NOT_EDITABLE',
        'Only a draft quote can be edited. Send a revised quote instead.',
      );
    }

    const attachmentIds =
      dto.attachmentAssetIds !== undefined
        ? await this.assertOwnedAttachments(user.id, dto.attachmentAssetIds)
        : null;

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.quote.update({
        where: { id: quoteId },
        data: {
          ...(dto.price !== undefined ? { price: dto.price } : {}),
          ...(dto.durationValue !== undefined ? { durationValue: dto.durationValue } : {}),
          ...(dto.durationUnit !== undefined ? { durationUnit: dto.durationUnit } : {}),
          ...(dto.includes !== undefined ? { includes: dto.includes } : {}),
          ...(dto.message !== undefined ? { message: dto.message } : {}),
          ...(dto.expiresAt !== undefined
            ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
            : {}),
        },
        select: QUOTE_SELECT,
      });

      if (attachmentIds) {
        await tx.quoteAttachment.deleteMany({ where: { quoteId } });
        if (attachmentIds.length > 0) {
          await tx.quoteAttachment.createMany({
            data: attachmentIds.map((mediaAssetId) => ({ quoteId, mediaAssetId })),
          });
        }
      }

      return updated;
    });
  }

  /** Sends a draft quote (QTE-03: Draft → Sent). */
  async send(user: AuthenticatedUser, quoteId: string): Promise<QuoteRow> {
    const quote = await this.requireOwnQuote(quoteId, user.id);
    this.assertQuoteMove(quote.status, QuoteStatus.SENT, 'WORKER');

    const job = await this.prisma.client.job.findUnique({
      where: { id: quote.jobId },
      select: { posterId: true, status: true },
    });
    if (!job) {
      throw this.jobNotFound();
    }

    const updated = await this.prisma.client.quote.update({
      where: { id: quoteId },
      data: { status: QuoteStatus.SENT, sentAt: new Date() },
      select: QUOTE_SELECT,
    });

    await this.onSent(quoteId, quote.jobId, user.id, job.posterId, job.status, updated.price);
    return updated;
  }

  /**
   * A counter-offer from the worker (QTE-03). The parent is superseded — marked
   * DECLINED with `supersededAt` so the UI can label it "Revised" — and a fresh
   * SENT quote is created chained to it. The old price stays on the old row.
   */
  async revise(
    user: AuthenticatedUser,
    parentQuoteId: string,
    dto: CreateQuoteDto,
  ): Promise<QuoteRow> {
    const parent = await this.requireOwnQuote(parentQuoteId, user.id);

    const job = await this.prisma.client.job.findUnique({
      where: { id: parent.jobId },
      select: { posterId: true, status: true },
    });
    if (!job) {
      throw this.jobNotFound();
    }
    if (!QUOTABLE_STATUSES.includes(job.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'JOB_NOT_QUOTABLE',
        'This job is no longer accepting quotes.',
      );
    }

    const attachmentIds = await this.assertOwnedAttachments(user.id, dto.attachmentAssetIds);

    const revision = await this.prisma.client.$transaction(async (tx) => {
      // Supersede the parent unless it is already settled (accepted/expired).
      if (parent.status === QuoteStatus.SENT || parent.status === QuoteStatus.VIEWED) {
        await tx.quote.update({
          where: { id: parentQuoteId },
          data: { status: QuoteStatus.DECLINED, supersededAt: new Date(), respondedAt: new Date() },
        });
      }

      const created = await tx.quote.create({
        data: {
          jobId: parent.jobId,
          workerId: user.id,
          applicationId: parent.applicationId,
          parentQuoteId,
          price: dto.price,
          durationValue: dto.durationValue ?? null,
          durationUnit: dto.durationUnit ?? null,
          includes: dto.includes ?? [],
          message: dto.message ?? null,
          status: QuoteStatus.SENT,
          sentAt: new Date(),
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
        select: QUOTE_SELECT,
      });

      if (attachmentIds.length > 0) {
        await tx.quoteAttachment.createMany({
          data: attachmentIds.map((mediaAssetId) => ({ quoteId: created.id, mediaAssetId })),
        });
      }

      return created;
    });

    await this.onSent(revision.id, parent.jobId, user.id, job.posterId, job.status, revision.price);
    logger.info('Quote revised', { payload: { parentQuoteId, quoteId: revision.id } });
    return revision;
  }

  /** The client opens a quote — records the "Viewed" signal (QTE-04). */
  async markViewed(user: AuthenticatedUser, quoteId: string): Promise<QuoteRow> {
    const quote = await this.requireClientQuote(quoteId, user.id);

    // Idempotent: viewing an already-viewed (or answered) quote is a no-op read.
    if (quote.status !== QuoteStatus.SENT) {
      return this.toRow(quote);
    }

    return this.prisma.client.quote.update({
      where: { id: quoteId },
      data: { status: QuoteStatus.VIEWED, viewedAt: new Date() },
      select: QUOTE_SELECT,
    });
  }

  /** The client declines a quote (QTE-02). */
  async decline(user: AuthenticatedUser, quoteId: string, dto: DeclineQuoteDto): Promise<QuoteRow> {
    const quote = await this.requireClientQuote(quoteId, user.id);
    this.assertQuoteMove(quote.status, QuoteStatus.DECLINED, 'CLIENT');

    const updated = await this.prisma.client.quote.update({
      where: { id: quoteId },
      data: {
        status: QuoteStatus.DECLINED,
        respondedAt: new Date(),
        declineReason: dto.reason ?? null,
      },
      select: QUOTE_SELECT,
    });

    this.events.emit(
      QUOTE_DECLINED,
      new QuoteDeclinedEvent({
        quoteId,
        jobId: quote.jobId,
        workerId: quote.workerId,
        requestId: getRequestId(),
      }),
    );

    return updated;
  }

  /**
   * The client asks for a counter-offer (QTE-02). Not a status change — the
   * quote stays live — just the latest ask recorded on it, overwriting any
   * previous one. The worker answers by revising.
   */
  async requestCounter(
    user: AuthenticatedUser,
    quoteId: string,
    dto: RequestCounterDto,
  ): Promise<QuoteRow> {
    const quote = await this.requireClientQuote(quoteId, user.id);

    if (quote.status !== QuoteStatus.SENT && quote.status !== QuoteStatus.VIEWED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'QUOTE_NOT_OPEN',
        'You can only ask for a counter-offer on a live quote.',
      );
    }

    const updated = await this.prisma.client.quote.update({
      where: { id: quoteId },
      data: {
        counterRequestedAt: new Date(),
        counterMessage: dto.message ?? null,
        counterTargetPrice: dto.targetPrice ?? null,
        // Opening the quote to counter also counts as viewing it.
        ...(quote.status === QuoteStatus.SENT
          ? { status: QuoteStatus.VIEWED, viewedAt: new Date() }
          : {}),
      },
      select: QUOTE_SELECT,
    });

    this.events.emit(
      QUOTE_COUNTER_REQUESTED,
      new QuoteCounterRequestedEvent({
        quoteId,
        jobId: quote.jobId,
        workerId: quote.workerId,
        targetPrice: dto.targetPrice ?? null,
        message: dto.message ?? null,
        requestId: getRequestId(),
      }),
    );

    return updated;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  /** Shared side effects of a quote going out: job → QUOTED, notify the client. */
  private async onSent(
    quoteId: string,
    jobId: string,
    workerId: string,
    clientId: string,
    jobStatus: JobStatus,
    price: number,
  ): Promise<void> {
    // The first quote moves an OPEN job to QUOTED (§21.3). A SYSTEM transition —
    // the worker did not move the job, sending a quote did.
    if (jobStatus === JobStatus.OPEN) {
      await this.jobs.applySystemTransition(jobId, JobStatus.QUOTED, {
        actorId: workerId,
        note: 'First quote received',
        requestId: getRequestId(),
      });
    }

    this.events.emit(
      QUOTE_SENT,
      new QuoteSentEvent({ quoteId, jobId, workerId, clientId, price, requestId: getRequestId() }),
    );
  }

  private assertQuoteMove(from: QuoteStatus, to: QuoteStatus, actor: 'WORKER' | 'CLIENT'): void {
    if (!isQuoteTransitionAllowedFor(from, to, actor)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ILLEGAL_QUOTE_TRANSITION',
        `A ${from} quote cannot move to ${to}.`,
      );
    }
  }

  private async requireOwnQuote(quoteId: string, workerId: string) {
    const quote = await this.prisma.client.quote.findFirst({
      where: { id: quoteId, workerId },
      select: {
        id: true,
        jobId: true,
        workerId: true,
        applicationId: true,
        price: true,
        status: true,
        includes: true,
        message: true,
        createdAt: true,
      },
    });
    if (!quote) {
      throw this.quoteNotFound();
    }
    return quote;
  }

  /** A quote on the caller's own job — the client side of the negotiation. */
  private async requireClientQuote(quoteId: string, clientId: string) {
    const quote = await this.prisma.client.quote.findFirst({
      where: { id: quoteId, job: { posterId: clientId } },
      select: {
        id: true,
        jobId: true,
        workerId: true,
        price: true,
        status: true,
        includes: true,
        message: true,
        createdAt: true,
      },
    });
    if (!quote) {
      throw this.quoteNotFound();
    }
    return quote;
  }

  private async assertApplicationBelongs(
    applicationId: string | null | undefined,
    jobId: string,
    workerId: string,
  ): Promise<void> {
    if (!applicationId) {
      return;
    }
    const application = await this.prisma.client.jobApplication.findFirst({
      where: { id: applicationId, jobId, workerId },
      select: { id: true },
    });
    if (!application) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'APPLICATION_MISMATCH',
        'That application is not yours for this job.',
        { applicationId: ['Remove the application reference and try again.'] },
      );
    }
  }

  /** Verifies each attachment is the worker's own QUOTE_ATTACHMENT upload. */
  private async assertOwnedAttachments(
    userId: string,
    ids: string[] | undefined,
  ): Promise<string[]> {
    if (!ids || ids.length === 0) {
      return [];
    }
    const unique = [...new Set(ids)];
    const assets = await this.prisma.client.mediaAsset.findMany({
      where: { id: { in: unique }, ownerId: userId, deletedAt: null },
      select: { id: true, kind: true },
    });
    const byId = new Map(assets.map((a) => [a.id, a.kind]));

    for (const id of unique) {
      const kind = byId.get(id);
      if (!kind) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'MEDIA_NOT_FOUND',
          'An attachment was not found.',
          {
            attachmentAssetIds: ['Upload the file again.'],
          },
        );
      }
      if (kind !== MediaAssetKind.QUOTE_ATTACHMENT) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'MEDIA_WRONG_KIND',
          'That file cannot be attached to a quote.',
          { attachmentAssetIds: ['Upload it as a quote attachment.'] },
        );
      }
    }
    return unique;
  }

  private toRow(quote: {
    id: string;
    jobId: string;
    workerId: string;
    price: number;
    status: QuoteStatus;
    includes: string[];
    message: string | null;
    createdAt: Date;
  }): QuoteRow {
    return {
      id: quote.id,
      jobId: quote.jobId,
      workerId: quote.workerId,
      price: quote.price,
      status: quote.status,
      includes: quote.includes,
      message: quote.message,
      createdAt: quote.createdAt,
    };
  }

  private jobNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'That job was not found.');
  }

  private quoteNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'QUOTE_NOT_FOUND', 'That quote was not found.');
  }
}
