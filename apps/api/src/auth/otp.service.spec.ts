import { VerificationPurpose } from '@trustpro/database';
import { AppException } from '../lib/app-exception';
import { hashSecret } from '../lib/secret-hash.util';
import type { NotificationRequestedEvent } from '../notifications/events/notification.events';
import type { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { OtpConfig } from './auth.config';
import { OtpService } from './otp.service';

process.env.AUTH_SECRET_PEPPER ??= 'test-pepper';

const CONFIG: OtpConfig = {
  length: 6,
  ttlMs: 600_000,
  maxAttempts: 3,
  resendCooldownMs: 60_000,
  maxPerWindow: 3,
  windowMs: 3_600_000,
};

const USER = { id: 'user-1', email: 'ada@example.cm', phone: '+237655555555', locale: 'en' };

interface CodeRow {
  id: string;
  codeHash: string;
  destination: string;
  expiresAt: Date;
  attempts: number;
}

/** Minimal in-memory stand-in for the two tables OtpService touches. */
function makePrisma(options: {
  user?: typeof USER | null;
  recent?: { createdAt: Date }[];
  liveCode?: CodeRow | null;
}) {
  const state = {
    created: [] as { codeHash: string; expiresAt: Date }[],
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    update: jest.fn().mockResolvedValue({ attempts: 1 }),
    deleted: [] as string[],
    findFirst: jest.fn().mockResolvedValue(options.liveCode ?? null),
  };

  const prisma = {
    client: {
      user: {
        findUnique: jest.fn().mockResolvedValue(options.user === undefined ? USER : options.user),
      },
      verificationCode: {
        findMany: jest.fn().mockResolvedValue(options.recent ?? []),
        findFirst: state.findFirst,
        create: jest.fn().mockImplementation((args: { data: CodeRow }) => {
          state.created.push(args.data);
          return Promise.resolve({ id: 'code-1', createdAt: new Date() });
        }),
        updateMany: state.updateMany,
        update: state.update,
        delete: jest.fn().mockImplementation((args: { where: { id: string } }) => {
          state.deleted.push(args.where.id);
          return Promise.resolve({});
        }),
      },
      $transaction: (fn: (tx: unknown) => unknown) => fn(prisma.client),
    },
  };

  return { prisma: prisma as unknown as PrismaService, state };
}

/** The one call OtpService is allowed to make outbound. */
type DispatchMock = jest.Mock<Promise<string[]>, [NotificationRequestedEvent]>;

function makeDispatcher(logIds: string[] = ['log-1']): NotificationDispatcher & {
  dispatch: DispatchMock;
} {
  const dispatch = jest
    .fn<Promise<string[]>, [NotificationRequestedEvent]>()
    .mockResolvedValue(logIds);

  return { dispatch } as unknown as NotificationDispatcher & { dispatch: DispatchMock };
}

/**
 * `expect.objectContaining` is typed `any`, so nesting it inside an object
 * literal trips no-unsafe-assignment. This keeps the matcher readable while
 * giving the nested value a real type.
 */
function containing(shape: Record<string, unknown>): unknown {
  return expect.objectContaining(shape);
}

/** The event handed to the dispatcher on the first (and only) dispatch call. */
function dispatchedEvent(dispatcher: { dispatch: DispatchMock }): NotificationRequestedEvent {
  const call = dispatcher.dispatch.mock.calls[0];
  if (!call) {
    throw new Error('the dispatcher was never called');
  }
  return call[0];
}

/** The OTP code actually sent, read back off the dispatched event. */
function dispatchedCode(dispatcher: { dispatch: DispatchMock }): string {
  return (dispatchedEvent(dispatcher).variables as { code: string }).code;
}

describe('OtpService.issue', () => {
  it('delivers through the dispatcher and never names a channel or provider', async () => {
    const { prisma } = makePrisma({});
    const dispatcher = makeDispatcher();
    const service = new OtpService(prisma, dispatcher, CONFIG);

    await service.issue({ userId: USER.id, purpose: VerificationPurpose.PHONE_VERIFICATION });

    // The ONLY outbound call is dispatch(templateKey). This is the property that
    // makes "switch to SMS later with no code change here" true: the channel is
    // chosen downstream, so nothing in this service has to learn about SMS.
    const event = dispatchedEvent(dispatcher);
    const variables = event.variables as { code: string; expiresInMinutes: number };

    expect(event.templateKey).toBe('auth.otp_code');
    expect(event.userId).toBe(USER.id);
    expect(variables.code).toMatch(/^\d{6}$/);
    expect(variables.expiresInMinutes).toBe(10);
  });

  it('stores only a digest of the code, never the code itself', async () => {
    const { prisma, state } = makePrisma({});
    const dispatcher = makeDispatcher();
    const service = new OtpService(prisma, dispatcher, CONFIG);

    await service.issue({ userId: USER.id, purpose: VerificationPurpose.PHONE_VERIFICATION });

    const sentCode = dispatchedCode(dispatcher);
    const stored = state.created[0]!;

    expect(stored.codeHash).not.toContain(sentCode);
    expect(stored.codeHash).toEqual(hashSecret(sentCode));
  });

  it('masks the destination in the response', async () => {
    const { prisma } = makePrisma({});
    const service = new OtpService(prisma, makeDispatcher(), CONFIG);

    const result = await service.issue({
      userId: USER.id,
      purpose: VerificationPurpose.PHONE_VERIFICATION,
    });

    expect(result.destination).not.toEqual(USER.email);
    expect(result.destination).toContain('@example.cm');
  });

  it('returns the countdown the resend UI needs', async () => {
    const { prisma } = makePrisma({});
    const service = new OtpService(prisma, makeDispatcher(), CONFIG);

    const result = await service.issue({
      userId: USER.id,
      purpose: VerificationPurpose.PHONE_VERIFICATION,
    });

    const gap = result.resendAvailableAt.getTime() - Date.now();
    expect(gap).toBeGreaterThan(50_000);
    expect(gap).toBeLessThanOrEqual(60_000);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses a resend inside the cooldown and says how long to wait', async () => {
    const { prisma } = makePrisma({ recent: [{ createdAt: new Date(Date.now() - 10_000) }] });
    const dispatcher = makeDispatcher();
    const service = new OtpService(prisma, dispatcher, CONFIG);

    const error = await service
      .issue({ userId: USER.id, purpose: VerificationPurpose.PHONE_VERIFICATION })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('RESEND_TOO_SOON');
    // ~50s left of a 60s cooldown, surfaced so the client can render a countdown.
    expect(Number((error as AppException).fields?.retryAfterSeconds?.[0])).toBeGreaterThan(45);
    // Throttling happens BEFORE any delivery, so a blocked resend costs nothing.
    expect(dispatcher.dispatch.mock.calls).toHaveLength(0);
  });

  it('caps the number of codes per rolling window', async () => {
    const old = Date.now() - 120_000;
    const { prisma } = makePrisma({
      recent: [
        { createdAt: new Date(old) },
        { createdAt: new Date(old - 1000) },
        { createdAt: new Date(old - 2000) },
      ],
    });
    const service = new OtpService(prisma, makeDispatcher(), CONFIG);

    const error = await service
      .issue({ userId: USER.id, purpose: VerificationPurpose.PHONE_VERIFICATION })
      .catch((e: unknown) => e);

    expect((error as AppException).code).toBe('TOO_MANY_CODES');
  });

  it('retires earlier live codes so only the newest one works', async () => {
    const { prisma, state } = makePrisma({});
    const service = new OtpService(prisma, makeDispatcher(), CONFIG);

    await service.issue({ userId: USER.id, purpose: VerificationPurpose.PHONE_VERIFICATION });

    expect(state.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: containing({ userId: USER.id, consumedAt: null }),
      }),
    );
  });

  it('rolls the code back when no channel could deliver it', async () => {
    const { prisma, state } = makePrisma({});
    // Empty dispatch result = every channel skipped (no address, provider off…).
    const service = new OtpService(prisma, makeDispatcher([]), CONFIG);

    const error = await service
      .issue({ userId: USER.id, purpose: VerificationPurpose.PHONE_VERIFICATION })
      .catch((e: unknown) => e);

    expect((error as AppException).code).toBe('OTP_UNDELIVERABLE');
    // The row is removed, so a failed send does not silently burn the user's
    // resend window.
    expect(state.deleted).toEqual(['code-1']);
  });
});

describe('OtpService.verify', () => {
  const liveCode = (overrides: Partial<CodeRow> = {}): CodeRow => ({
    id: 'code-1',
    codeHash: hashSecret('123456'),
    destination: USER.email,
    expiresAt: new Date(Date.now() + 300_000),
    attempts: 0,
    ...overrides,
  });

  it('accepts the correct code and consumes it atomically', async () => {
    const { prisma, state } = makePrisma({ liveCode: liveCode() });
    state.updateMany.mockResolvedValue({ count: 1 });
    const service = new OtpService(prisma, makeDispatcher(), CONFIG);

    const result = await service.verify({
      userId: USER.id,
      purpose: VerificationPurpose.PHONE_VERIFICATION,
      code: '123456',
    });

    expect(result.destination).toBe(USER.email);
    // `consumedAt: null` in the WHERE is what stops two racing requests both
    // succeeding with the same code.
    expect(state.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'code-1', consumedAt: null } }),
    );
  });

  it('rejects an expired code as expired, not as wrong', async () => {
    const { prisma } = makePrisma({
      liveCode: liveCode({ expiresAt: new Date(Date.now() - 1000) }),
    });
    const service = new OtpService(prisma, makeDispatcher(), CONFIG);

    const error = await service
      .verify({ userId: USER.id, purpose: VerificationPurpose.PHONE_VERIFICATION, code: '123456' })
      .catch((e: unknown) => e);

    expect((error as AppException).code).toBe('CODE_EXPIRED');
  });

  it('counts a wrong guess and reports the attempts left', async () => {
    const { prisma, state } = makePrisma({ liveCode: liveCode() });
    state.update.mockResolvedValue({ attempts: 1 });
    const service = new OtpService(prisma, makeDispatcher(), CONFIG);

    const error = await service
      .verify({ userId: USER.id, purpose: VerificationPurpose.PHONE_VERIFICATION, code: '000000' })
      .catch((e: unknown) => e);

    expect((error as AppException).code).toBe('INVALID_CODE');
    expect((error as AppException).message).toContain('2 attempts left');
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    );
  });

  it('burns the code once the attempt limit is reached', async () => {
    const { prisma } = makePrisma({ liveCode: liveCode({ attempts: 3 }) });
    const service = new OtpService(prisma, makeDispatcher(), CONFIG);

    const error = await service
      .verify({ userId: USER.id, purpose: VerificationPurpose.PHONE_VERIFICATION, code: '123456' })
      .catch((e: unknown) => e);

    // Correct code, but the row is dead — brute force cannot be outlasted.
    expect((error as AppException).code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('gives the same answer for "no code" as for "wrong code"', async () => {
    const { prisma } = makePrisma({ liveCode: null });
    const service = new OtpService(prisma, makeDispatcher(), CONFIG);

    const error = await service
      .verify({ userId: USER.id, purpose: VerificationPurpose.PHONE_VERIFICATION, code: '123456' })
      .catch((e: unknown) => e);

    // Distinguishing them would reveal whether a code is outstanding.
    expect((error as AppException).code).toBe('INVALID_CODE');
  });

  it('will not let a code minted for one purpose satisfy another', async () => {
    const { prisma, state } = makePrisma({ liveCode: liveCode() });
    const service = new OtpService(prisma, makeDispatcher(), CONFIG);

    await service.verify({
      userId: USER.id,
      purpose: VerificationPurpose.TWO_FACTOR,
      code: '123456',
    });

    // The purpose is part of the lookup, so a PHONE_VERIFICATION code is simply
    // not found when a TWO_FACTOR one is asked for.
    expect(state.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: containing({ purpose: VerificationPurpose.TWO_FACTOR }),
      }),
    );
  });
});
