import type { EventEmitter2 } from '@nestjs/event-emitter';
import { ReviewStatus, TrustEventType } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { TrustScoreService } from '../trust/trust-score.service';
import { ReviewsService } from './reviews.service';

/**
 * The service's own reasoning, as opposed to the rules in review.model.ts:
 * WHICH trust event a moderation action appends, and in WHAT ORDER the rating
 * aggregate and the ledger are written. Both are invisible in a happy-path test
 * and both are wrong in ways nobody notices for months.
 */

const ADMIN = { id: 'admin-1' } as AuthenticatedUser;

interface ReviewRow {
  id: string;
  authorId: string;
  subjectId: string;
  rating: number;
  status: ReviewStatus;
}

function makeHarness(review: ReviewRow) {
  /** Everything the services touch, in call order, so ordering is assertable. */
  const calls: string[] = [];

  const prisma = {
    client: {
      review: {
        findUnique: jest.fn().mockResolvedValue(review),
        update: jest.fn().mockReturnValue('review.update'),
        groupBy: jest.fn().mockImplementation(() => {
          calls.push('groupBy');
          return Promise.resolve([{ rating: review.rating, _count: { _all: 1 } }]);
        }),
      },
      trustScore: {
        upsert: jest.fn().mockImplementation(() => {
          calls.push('averageRating');
          return Promise.resolve({});
        }),
      },
      auditLog: { create: jest.fn().mockReturnValue('audit.create') },
      $transaction: jest.fn().mockImplementation(() => {
        calls.push('$transaction');
        return Promise.resolve([]);
      }),
    },
  } as unknown as PrismaService;

  const record = jest.fn().mockImplementation((input: { type: TrustEventType }) => {
    calls.push(`record:${input.type}`);
    return Promise.resolve({});
  });
  const recompute = jest.fn().mockImplementation(() => {
    calls.push('recompute');
    return Promise.resolve({});
  });

  const emit = jest.fn();

  const service = new ReviewsService(
    prisma,
    { emit } as unknown as EventEmitter2,
    { record, recompute } as unknown as TrustScoreService,
  );

  return { service, prisma, record, recompute, emit, calls };
}

const published = (rating: number): ReviewRow => ({
  id: 'review-1',
  authorId: 'client-1',
  subjectId: 'worker-1',
  rating,
  status: ReviewStatus.PUBLISHED,
});

const hidden = (rating: number): ReviewRow => ({
  ...published(rating),
  status: ReviewStatus.HIDDEN,
});

describe('ReviewsService — moderation and the trust ledger (REV-03)', () => {
  it('revokes the trust event when a review that PAID is hidden', async () => {
    const { service, record } = makeHarness(published(5));

    await service.hide(ADMIN, 'review-1', { reason: 'Contains personal information.' });

    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({
      subjectId: 'worker-1',
      type: TrustEventType.EXCELLENT_REVIEW_REVOKED,
      sourceType: 'Review',
      sourceId: 'review-1',
    });
  });

  it('appends NO revocation when the hidden review never qualified', async () => {
    // A 3-star review pays nothing, so revoking it would subtract an occurrence
    // the ledger never granted. `effectiveOccurrences` floors that at zero today
    // — which makes this a bug that is silently harmless right up until the
    // revocation rule changes.
    const { service, record, recompute } = makeHarness(published(3));

    await service.hide(ADMIN, 'review-1', { reason: 'Off-topic and abusive.' });

    expect(record).not.toHaveBeenCalled();
    // Still recomputed: the average moved, and the tier gate reads it.
    expect(recompute).toHaveBeenCalledWith('worker-1');
  });

  it('re-grants the trust event when a hidden review is reinstated', async () => {
    const { service, record } = makeHarness(hidden(4));

    await service.restore(ADMIN, 'review-1');

    expect(record.mock.calls[0][0]).toMatchObject({
      type: TrustEventType.EXCELLENT_REVIEW,
    });
  });

  it('is idempotent — hiding an already-hidden review changes nothing', async () => {
    const { service, record, recompute, prisma, emit } = makeHarness(hidden(5));

    const result = await service.hide(ADMIN, 'review-1', { reason: 'Duplicate moderation call.' });

    expect(result.status).toBe(ReviewStatus.HIDDEN);
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(recompute).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('is idempotent — restoring a published review changes nothing', async () => {
    const { service, record, prisma } = makeHarness(published(5));

    const result = await service.restore(ADMIN, 'review-1');

    expect(result.status).toBe(ReviewStatus.PUBLISHED);
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('writes the rating aggregate BEFORE reporting to the ledger', async () => {
    // The recompute derives the tier, and the Tier 3 gate reads averageRating
    // (§21.4 "≥ 4.8"). Recording first would derive a tier from the rating this
    // moderation action just replaced.
    const { service, calls } = makeHarness(published(5));

    await service.hide(ADMIN, 'review-1', { reason: 'Contains personal information.' });

    expect(calls.indexOf('averageRating')).toBeLessThan(
      calls.indexOf(`record:${TrustEventType.EXCELLENT_REVIEW_REVOKED}`),
    );
  });

  it('records the moderation decision in the audit log', async () => {
    const { service, prisma } = makeHarness(published(5));

    await service.hide(ADMIN, 'review-1', { reason: 'Contains personal information.' });

    expect(prisma.client.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin-1',
          action: 'review.hidden',
          target: 'Review:review-1',
        }),
      }),
    );
  });
});
