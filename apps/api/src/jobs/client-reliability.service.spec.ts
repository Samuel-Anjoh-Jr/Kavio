import { BookingStatus, VerificationTier } from '@kavio/database';
import type { PrismaService } from '../prisma/prisma.service';
import { ClientReliabilityService } from './client-reliability.service';

/**
 * The client card is the mirror of the worker card, and it carries the same two
 * traps: an unrated client must not read as a bad one, and a page of jobs must
 * not fan out into a query per poster.
 */

interface Fixture {
  users?: Array<{
    id: string;
    name: string | null;
    avatar: string | null;
    tier: VerificationTier;
    trustScore: number;
    createdAt: Date;
  }>;
  posted?: Array<{ posterId: string; _count: { _all: number } }>;
  bookings?: Array<{ clientId: string; status: BookingStatus; _count: { _all: number } }>;
  ratings?: Array<{ subjectId: string; rating: number; _count: { _all: number } }>;
  lostDisputes?: Array<{ booking: { clientId: string } }>;
}

const JOINED = new Date('2026-01-01T00:00:00Z');

function makeHarness(fixture: Fixture = {}) {
  const calls = { user: 0, job: 0, booking: 0, review: 0, dispute: 0 };

  const prisma = {
    client: {
      user: {
        findMany: jest.fn().mockImplementation(() => {
          calls.user += 1;
          return Promise.resolve(fixture.users ?? []);
        }),
      },
      job: {
        groupBy: jest.fn().mockImplementation(() => {
          calls.job += 1;
          return Promise.resolve(fixture.posted ?? []);
        }),
      },
      booking: {
        groupBy: jest.fn().mockImplementation(() => {
          calls.booking += 1;
          return Promise.resolve(fixture.bookings ?? []);
        }),
      },
      review: {
        groupBy: jest.fn().mockImplementation(() => {
          calls.review += 1;
          return Promise.resolve(fixture.ratings ?? []);
        }),
      },
      dispute: {
        findMany: jest.fn().mockImplementation(() => {
          calls.dispute += 1;
          return Promise.resolve(fixture.lostDisputes ?? []);
        }),
      },
    },
  } as unknown as PrismaService;

  return { service: new ClientReliabilityService(prisma), calls, prisma };
}

type FixtureUser = NonNullable<Fixture['users']>[number];

const user = (id: string, overrides: Partial<FixtureUser> = {}): FixtureUser => ({
  id,
  name: `Client ${id}`,
  avatar: null,
  tier: VerificationTier.TIER_1,
  trustScore: 40,
  createdAt: JOINED,
  ...overrides,
});

describe('ClientReliabilityService (JOB-03, JOB-04)', () => {
  it('returns nothing for an empty request without touching the database', async () => {
    const { service, calls } = makeHarness();

    const cards = await service.forClients([]);

    expect(cards.size).toBe(0);
    expect(calls).toEqual({ user: 0, job: 0, booking: 0, review: 0, dispute: 0 });
  });

  it('builds a whole page of cards in a fixed number of queries', async () => {
    // The N+1 guard: five queries for five clients, and five for fifty.
    const ids = Array.from({ length: 50 }, (_, i) => `client-${i}`);
    const { service, calls } = makeHarness({ users: ids.map((id) => user(id)) });

    const cards = await service.forClients(ids);

    expect(cards.size).toBe(50);
    expect(calls).toEqual({ user: 1, job: 1, booking: 1, review: 1, dispute: 1 });
  });

  it('deduplicates repeated posters on a board page', async () => {
    // One client posting eight of the twenty jobs on screen is normal.
    const { service, prisma } = makeHarness({ users: [user('client-1')] });

    await service.forClients(['client-1', 'client-1', 'client-1']);

    expect(prisma.client.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['client-1'] } } }),
    );
  });

  it('reports a brand-new client as unrated rather than badly rated', async () => {
    const { service } = makeHarness({ users: [user('client-1')] });

    const card = await service.forClient('client-1');

    // Null, never 0 — the trap this whole card exists around.
    expect(card?.averageRating).toBeNull();
    expect(card?.completionRate).toBeNull();
    expect(card?.ratedJobs).toBe(0);
    expect(card?.jobsPosted).toBe(0);
    expect(card?.disputesLost).toBe(0);
  });

  it('averages the reviews workers left about the client', async () => {
    const { service } = makeHarness({
      users: [user('client-1')],
      ratings: [
        { subjectId: 'client-1', rating: 5, _count: { _all: 3 } },
        { subjectId: 'client-1', rating: 4, _count: { _all: 1 } },
      ],
    });

    const card = await service.forClient('client-1');

    // (5x3 + 4x1) / 4 = 4.75
    expect(card?.averageRating).toBe(4.75);
    expect(card?.ratedJobs).toBe(4);
  });

  it('counts completion across both finished booking states', async () => {
    const { service } = makeHarness({
      users: [user('client-1')],
      posted: [{ posterId: 'client-1', _count: { _all: 10 } }],
      bookings: [
        { clientId: 'client-1', status: BookingStatus.COMPLETED, _count: { _all: 2 } },
        { clientId: 'client-1', status: BookingStatus.RELEASED, _count: { _all: 6 } },
        { clientId: 'client-1', status: BookingStatus.CANCELLED, _count: { _all: 3 } },
        { clientId: 'client-1', status: BookingStatus.IN_PROGRESS, _count: { _all: 1 } },
      ],
    });

    const card = await service.forClient('client-1');

    expect(card?.jobsCompleted).toBe(8);
    expect(card?.completionRate).toBe(0.8);
    expect(card?.cancelledBookings).toBe(3);
  });

  it('counts disputes found against the client, per client', async () => {
    const { service } = makeHarness({
      users: [user('client-1'), user('client-2')],
      lostDisputes: [
        { booking: { clientId: 'client-1' } },
        { booking: { clientId: 'client-1' } },
        { booking: { clientId: 'client-2' } },
      ],
    });

    const cards = await service.forClients(['client-1', 'client-2']);

    expect(cards.get('client-1')?.disputesLost).toBe(2);
    expect(cards.get('client-2')?.disputesLost).toBe(1);
  });

  it('keeps each client’s figures separate in a batch', async () => {
    const { service } = makeHarness({
      users: [user('client-1'), user('client-2', { trustScore: 90 })],
      posted: [
        { posterId: 'client-1', _count: { _all: 4 } },
        { posterId: 'client-2', _count: { _all: 1 } },
      ],
      ratings: [
        { subjectId: 'client-1', rating: 2, _count: { _all: 1 } },
        { subjectId: 'client-2', rating: 5, _count: { _all: 2 } },
      ],
    });

    const cards = await service.forClients(['client-1', 'client-2']);

    expect(cards.get('client-1')?.jobsPosted).toBe(4);
    expect(cards.get('client-1')?.averageRating).toBe(2);
    expect(cards.get('client-2')?.jobsPosted).toBe(1);
    expect(cards.get('client-2')?.averageRating).toBe(5);
    expect(cards.get('client-2')?.trustScore).toBe(90);
  });

  it('returns null for an identity that no longer exists', async () => {
    const { service } = makeHarness({ users: [] });
    expect(await service.forClient('deleted-client')).toBeNull();
  });
});
