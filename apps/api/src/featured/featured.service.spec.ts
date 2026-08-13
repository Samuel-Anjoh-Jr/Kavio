import type { EventEmitter2 } from '@nestjs/event-emitter';
import { FeaturedListingStatus } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { FeaturedService } from './featured.service';

const ADMIN = { id: 'admin-1', activeRole: 'ADMIN' } as unknown as AuthenticatedUser;
const WORKER = { id: 'worker-1', activeRole: 'WORKER' } as unknown as AuthenticatedUser;
const OTHER_WORKER = { id: 'worker-2', activeRole: 'WORKER' } as unknown as AuthenticatedUser;

interface ListingRow {
  id: string;
  userId: string;
  status: FeaturedListingStatus;
  extraCommissionBps: number | null;
  requestedAt: Date;
  reviewedAt: Date | null;
  reviewedById: string | null;
  rejectionReason: string | null;
  pausedAt: Date | null;
  revokedAt: Date | null;
}

function baseListing(overrides: Partial<ListingRow> = {}): ListingRow {
  return {
    id: 'listing-1',
    userId: 'worker-1',
    status: FeaturedListingStatus.PENDING,
    extraCommissionBps: null,
    requestedAt: new Date('2026-01-01'),
    reviewedAt: null,
    reviewedById: null,
    rejectionReason: null,
    pausedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

/** Mutable store, so update() actually reflects what the next find sees. */
function makeHarness(initial: ListingRow | null) {
  let row: ListingRow | null = initial;

  const prisma = {
    client: {
      featuredListing: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(row)),
        findMany: jest.fn().mockImplementation(() => Promise.resolve(row ? [row] : [])),
        create: jest.fn().mockImplementation(({ data }: { data: Partial<ListingRow> }) => {
          row = baseListing({ ...data, id: 'listing-1' });
          return Promise.resolve(row);
        }),
        update: jest.fn().mockImplementation(({ data }: { data: Partial<ListingRow> }) => {
          row = { ...(row as ListingRow), ...data };
          return Promise.resolve(row);
        }),
        updateMany: jest.fn().mockResolvedValue({ count: row ? 1 : 0 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      // Array-form $transaction: resolve whatever promises were handed in, the
      // same way the real client resolves each operation in sequence.
      $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    },
  } as unknown as PrismaService;

  const emit = jest.fn();
  const service = new FeaturedService(prisma, { emit } as unknown as EventEmitter2);

  return { service, prisma, emit, getRow: () => row };
}

describe('FeaturedService — request', () => {
  it('creates a PENDING row when none exists', async () => {
    const { service, getRow } = makeHarness(null);

    const result = await service.request(WORKER);

    expect(result.status).toBe(FeaturedListingStatus.PENDING);
    expect(getRow()?.userId).toBe('worker-1');
  });

  it('throws CONFLICT when a PENDING request already exists', async () => {
    const { service } = makeHarness(baseListing({ status: FeaturedListingStatus.PENDING }));

    await expect(service.request(WORKER)).rejects.toMatchObject({
      code: 'FEATURED_ALREADY_REQUESTED',
    });
  });

  it('throws CONFLICT when already APPROVED', async () => {
    const { service } = makeHarness(
      baseListing({ status: FeaturedListingStatus.APPROVED, extraCommissionBps: 500 }),
    );

    await expect(service.request(WORKER)).rejects.toMatchObject({
      code: 'FEATURED_ALREADY_REQUESTED',
    });
  });

  it('re-opens a REJECTED row back to PENDING, clearing the prior decision', async () => {
    const { service, getRow } = makeHarness(
      baseListing({
        status: FeaturedListingStatus.REJECTED,
        rejectionReason: 'Not enough completed jobs yet.',
        reviewedById: 'admin-1',
        reviewedAt: new Date('2026-01-02'),
      }),
    );

    const result = await service.request(WORKER);

    expect(result.status).toBe(FeaturedListingStatus.PENDING);
    expect(getRow()?.rejectionReason).toBeNull();
    expect(getRow()?.reviewedById).toBeNull();
  });
});

describe('FeaturedService — approve', () => {
  it('sets status APPROVED and the commission rate', async () => {
    const { service, getRow } = makeHarness(baseListing());

    const result = await service.approve('worker-1', ADMIN, 750, 'Strong track record.');

    expect(result.status).toBe(FeaturedListingStatus.APPROVED);
    expect(result.extraCommissionBps).toBe(750);
    expect(getRow()?.reviewedById).toBe('admin-1');
  });

  it('is not double-approvable — a second approve on an already-APPROVED row throws', async () => {
    const { service } = makeHarness(
      baseListing({ status: FeaturedListingStatus.APPROVED, extraCommissionBps: 500 }),
    );

    await expect(service.approve('worker-1', ADMIN, 800)).rejects.toMatchObject({
      code: 'FEATURED_NOT_DECIDABLE',
    });
  });

  it('rejects an out-of-range commission before touching the row', async () => {
    const { service, prisma } = makeHarness(baseListing());

    await expect(service.approve('worker-1', ADMIN, 10_001)).rejects.toMatchObject({
      code: 'INVALID_EXTRA_COMMISSION',
    });
    await expect(service.approve('worker-1', ADMIN, -1)).rejects.toMatchObject({
      code: 'INVALID_EXTRA_COMMISSION',
    });
    await expect(service.approve('worker-1', ADMIN, 1.5)).rejects.toMatchObject({
      code: 'INVALID_EXTRA_COMMISSION',
    });
    expect(prisma.client.featuredListing.update).not.toHaveBeenCalled();
  });

  it('re-approves a PAUSED listing with an updated rate', async () => {
    const { service } = makeHarness(
      baseListing({ status: FeaturedListingStatus.PAUSED, extraCommissionBps: 500 }),
    );

    const result = await service.approve('worker-1', ADMIN, 900);

    expect(result.status).toBe(FeaturedListingStatus.APPROVED);
    expect(result.extraCommissionBps).toBe(900);
  });
});

describe('FeaturedService — reject', () => {
  it('clears the listing to REJECTED with the reason', async () => {
    const { service, getRow } = makeHarness(baseListing());

    const result = await service.reject('worker-1', ADMIN, 'Trust Score is still building.');

    expect(result.status).toBe(FeaturedListingStatus.REJECTED);
    expect(result.rejectionReason).toBe('Trust Score is still building.');
    expect(getRow()?.reviewedById).toBe('admin-1');
  });

  it('refuses to reject anything but a PENDING request', async () => {
    const { service } = makeHarness(
      baseListing({ status: FeaturedListingStatus.APPROVED, extraCommissionBps: 500 }),
    );

    await expect(service.reject('worker-1', ADMIN, 'Too late for this.')).rejects.toMatchObject({
      code: 'FEATURED_NOT_DECIDABLE',
    });
  });
});

describe('FeaturedService — pause/resume', () => {
  it('round-trips an APPROVED listing through pause and resume', async () => {
    const { service, getRow } = makeHarness(
      baseListing({ status: FeaturedListingStatus.APPROVED, extraCommissionBps: 600 }),
    );

    const paused = await service.pause('worker-1', WORKER);
    expect(paused.status).toBe(FeaturedListingStatus.PAUSED);
    expect(getRow()?.pausedAt).not.toBeNull();

    const resumed = await service.resume('worker-1', WORKER);
    expect(resumed.status).toBe(FeaturedListingStatus.APPROVED);
    expect(resumed.extraCommissionBps).toBe(600);
    expect(getRow()?.pausedAt).toBeNull();
  });

  it('lets an admin pause on the subject’s behalf', async () => {
    const { service } = makeHarness(
      baseListing({ status: FeaturedListingStatus.APPROVED, extraCommissionBps: 600 }),
    );

    const result = await service.pause('worker-1', ADMIN);
    expect(result.status).toBe(FeaturedListingStatus.PAUSED);
  });

  it('refuses pause from anyone other than the subject or an admin', async () => {
    const { service } = makeHarness(
      baseListing({ status: FeaturedListingStatus.APPROVED, extraCommissionBps: 600 }),
    );

    await expect(service.pause('worker-1', OTHER_WORKER)).rejects.toMatchObject({
      code: 'NOT_FEATURED_LISTING_OWNER',
    });
  });

  it('refuses to pause anything that is not APPROVED', async () => {
    const { service } = makeHarness(baseListing({ status: FeaturedListingStatus.PENDING }));

    await expect(service.pause('worker-1', WORKER)).rejects.toMatchObject({
      code: 'FEATURED_NOT_ACTIVE',
    });
  });
});

describe('FeaturedService — activeExtraCommissionBpsFor', () => {
  it('returns 0 for a non-APPROVED listing', async () => {
    const { service } = makeHarness(baseListing({ status: FeaturedListingStatus.PENDING }));

    await expect(service.activeExtraCommissionBpsFor('worker-1')).resolves.toBe(0);
  });

  it('returns 0 when there is no listing at all', async () => {
    const { service } = makeHarness(null);

    await expect(service.activeExtraCommissionBpsFor('worker-1')).resolves.toBe(0);
  });

  it('returns the stored rate for an APPROVED listing', async () => {
    const { service } = makeHarness(
      baseListing({ status: FeaturedListingStatus.APPROVED, extraCommissionBps: 350 }),
    );

    await expect(service.activeExtraCommissionBpsFor('worker-1')).resolves.toBe(350);
  });
});

describe('FeaturedService — markShown', () => {
  it('never throws, even when the underlying update fails', async () => {
    const { service, prisma } = makeHarness(
      baseListing({ status: FeaturedListingStatus.APPROVED }),
    );
    (prisma.client.featuredListing.updateMany as jest.Mock).mockRejectedValueOnce(
      new Error('db unavailable'),
    );

    await expect(service.markShown(['worker-1'])).resolves.toBeUndefined();
  });

  it('is a no-op for an empty list', async () => {
    const { service, prisma } = makeHarness(null);

    await service.markShown([]);

    expect(prisma.client.featuredListing.updateMany).not.toHaveBeenCalled();
  });
});
