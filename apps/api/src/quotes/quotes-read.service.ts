import { Injectable } from '@nestjs/common';
import { MediaVisibility, QuoteStatus } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FeaturedService } from '../featured/featured.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import type { WorkerPreviewView } from '../jobs/models/job.model';
import type { BookingView, QuoteInboxView, QuoteView } from './models/quote.model';

/**
 * Quote & booking READS (PROMPTS 59-61; QTE-04). Each method backs a GraphQL
 * resolver; writes are on the REST controllers.
 *
 * A quote carries the worker's trust context so the client's quote view (QTE-02)
 * can show Trust Score and rating beside the price without a second round trip.
 * Those previews are batched, the same N+1 discipline as the jobs read service.
 *
 * `platformFeeBps` on the view is what the client sees BEFORE they pay (CLAUDE.md
 * "the ~10% fee shown before pay"), so it has to fold in a Featured/sponsored
 * worker's extra commission the same way BookingsService does at accept time —
 * otherwise the preview and the actual charge could disagree.
 */
@Injectable()
export class QuotesReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: PlatformSettingsService,
    private readonly featured: FeaturedService,
  ) {}

  /** One quote. Visible to the worker who sent it or the client it was sent to. */
  async getQuote(id: string, viewer: AuthenticatedUser | undefined): Promise<QuoteView | null> {
    if (!viewer) {
      return null;
    }
    const quote = await this.prisma.client.quote.findFirst({
      where: {
        id,
        OR: [{ workerId: viewer.id }, { job: { posterId: viewer.id } }],
      },
      include: this.quoteInclude(),
    });
    if (!quote) {
      return null;
    }
    const previews = await this.workerPreviews([quote.workerId]);
    const feeBps = await this.effectiveFeeBps([quote.workerId]);
    return this.mapQuote(quote, previews, feeBps);
  }

  /** The worker's Sent / Drafts inbox (QTE-04). */
  async myQuotes(user: AuthenticatedUser): Promise<QuoteInboxView> {
    const quotes = await this.prisma.client.quote.findMany({
      where: { workerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: this.quoteInclude(),
    });
    const previews = await this.workerPreviews([user.id]);
    const feeBps = await this.effectiveFeeBps([user.id]);
    const views = await Promise.all(quotes.map((q) => this.mapQuote(q, previews, feeBps)));
    return {
      sent: views.filter((v) => v.status !== QuoteStatus.DRAFT),
      drafts: views.filter((v) => v.status === QuoteStatus.DRAFT),
    };
  }

  /** The quotes a client received on one of their jobs (QTE-02). */
  async jobQuotes(user: AuthenticatedUser, jobId: string): Promise<QuoteView[]> {
    const job = await this.prisma.client.job.findFirst({
      where: { id: jobId, posterId: user.id },
      select: { id: true },
    });
    if (!job) {
      return [];
    }
    const quotes = await this.prisma.client.quote.findMany({
      where: {
        jobId,
        // A client sees offers that reached them, not the worker's private drafts.
        status: { not: QuoteStatus.DRAFT },
      },
      orderBy: { createdAt: 'desc' },
      include: this.quoteInclude(),
    });
    const previews = await this.workerPreviews(quotes.map((q) => q.workerId));
    const feeBps = await this.effectiveFeeBps(quotes.map((q) => q.workerId));
    return Promise.all(quotes.map((q) => this.mapQuote(q, previews, feeBps)));
  }

  /**
   * Every quote a client has received, across all their jobs (QTE-02, QTE-05).
   *
   * The aggregate the client's Received inbox is built on: one indexed query
   * plus one batched preview lookup, rather than a jobQuotes round trip per job.
   * The caller groups by jobId for display; the API stays flat and cheap.
   */
  async receivedQuotes(user: AuthenticatedUser): Promise<QuoteView[]> {
    const quotes = await this.prisma.client.quote.findMany({
      where: {
        job: { posterId: user.id },
        // The client sees offers that reached them, never a worker's private draft.
        status: { not: QuoteStatus.DRAFT },
      },
      orderBy: { createdAt: 'desc' },
      include: this.quoteInclude(),
    });
    const previews = await this.workerPreviews(quotes.map((q) => q.workerId));
    const feeBps = await this.effectiveFeeBps(quotes.map((q) => q.workerId));
    return Promise.all(quotes.map((q) => this.mapQuote(q, previews, feeBps)));
  }

  /** Both parties' bookings (QTE-04, PAY-01). */
  async myBookings(user: AuthenticatedUser): Promise<BookingView[]> {
    const bookings = await this.prisma.client.booking.findMany({
      where: { OR: [{ workerId: user.id }, { clientId: user.id }] },
      orderBy: { createdAt: 'desc' },
      include: { job: { select: { title: true } } },
    });
    return bookings.map((b) => ({
      id: b.id,
      jobId: b.jobId,
      jobTitle: b.job.title,
      quoteId: b.quoteId,
      workerId: b.workerId,
      clientId: b.clientId,
      agreedPrice: b.agreedPrice,
      platformFeeAmount: b.platformFeeAmount,
      workerPayoutAmount: b.workerPayoutAmount,
      status: b.status,
      createdAt: b.createdAt,
    }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  private quoteInclude() {
    return {
      job: { select: { title: true } },
      attachments: {
        include: { mediaAsset: { select: { s3Key: true, visibility: true } } },
      },
    };
  }

  private async mapQuote(
    quote: {
      id: string;
      jobId: string;
      job: { title: string | null };
      workerId: string;
      price: number;
      durationValue: number | null;
      durationUnit: QuoteView['durationUnit'];
      includes: string[];
      message: string | null;
      status: QuoteStatus;
      parentQuoteId: string | null;
      counterTargetPrice: number | null;
      counterMessage: string | null;
      sentAt: Date | null;
      viewedAt: Date | null;
      expiresAt: Date | null;
      createdAt: Date;
      attachments: Array<{
        id: string;
        mediaAsset: { s3Key: string; visibility: MediaVisibility };
      }>;
    },
    previews: Map<string, WorkerPreviewView>,
    feeBpsByWorker: Map<string, number>,
  ): Promise<QuoteView> {
    const attachments = await Promise.all(
      quote.attachments.map(async (a) => ({
        id: a.id,
        url: await this.storage.urlFor(a.mediaAsset.s3Key, a.mediaAsset.visibility),
      })),
    );

    return {
      id: quote.id,
      jobId: quote.jobId,
      jobTitle: quote.job.title,
      workerId: quote.workerId,
      price: quote.price,
      durationValue: quote.durationValue,
      durationUnit: quote.durationUnit,
      includes: quote.includes,
      message: quote.message,
      status: quote.status,
      platformFeeBps: feeBpsByWorker.get(quote.workerId) ?? 0,
      attachments,
      worker: previews.get(quote.workerId) ?? null,
      parentQuoteId: quote.parentQuoteId,
      counterTargetPrice: quote.counterTargetPrice,
      counterMessage: quote.counterMessage,
      sentAt: quote.sentAt,
      viewedAt: quote.viewedAt,
      expiresAt: quote.expiresAt,
      createdAt: quote.createdAt,
    };
  }

  /**
   * The fee a client would actually be charged per worker, batched — the
   * platform rate plus that worker's Featured extra commission, if APPROVED
   * (0 otherwise). Mirrors BookingsService.acceptQuote() exactly, so the
   * preview shown here never disagrees with what accepting the quote charges.
   */
  private async effectiveFeeBps(workerIds: string[]): Promise<Map<string, number>> {
    const [feeBps, extraByWorker] = await Promise.all([
      this.settings.platformFeeBps(),
      this.featured.activeExtraCommissionBpsForMany(workerIds),
    ]);

    const ids = [...new Set(workerIds)];
    return new Map(ids.map((id) => [id, Math.min(10_000, feeBps + (extraByWorker.get(id) ?? 0))]));
  }

  /** Batched worker cards — three queries regardless of count (N+1 guard). */
  private async workerPreviews(workerIds: string[]): Promise<Map<string, WorkerPreviewView>> {
    const ids = [...new Set(workerIds)];
    if (ids.length === 0) {
      return new Map();
    }
    const [users, profiles, scores] = await Promise.all([
      this.prisma.client.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, avatar: true, tier: true, trustScore: true },
      }),
      this.prisma.client.workerProfile.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, headline: true, city: true },
      }),
      this.prisma.client.trustScore.findMany({
        where: { subjectId: { in: ids } },
        select: { subjectId: true, completedJobs: true, averageRating: true },
      }),
    ]);
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
    const scoreByUser = new Map(scores.map((s) => [s.subjectId, s]));

    const previews = new Map<string, WorkerPreviewView>();
    for (const u of users) {
      const profile = profileByUser.get(u.id);
      const score = scoreByUser.get(u.id);
      previews.set(u.id, {
        workerId: u.id,
        name: u.name,
        avatar: u.avatar,
        headline: profile?.headline ?? null,
        city: profile?.city ?? null,
        tier: u.tier,
        trustScore: u.trustScore,
        completedJobs: score?.completedJobs ?? 0,
        averageRating: score?.averageRating != null ? Number(score.averageRating) : null,
      });
    }
    return previews;
  }
}
