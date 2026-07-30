import { HttpStatus } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Role, UserStatus } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import type { OtpService } from './otp.service';
import type { SessionService } from './session.service';

/**
 * Sign-up touches neither OTP nor sessions, so those collaborators are inert
 * stubs here; their own behaviour is covered in otp.service.spec.ts and
 * session.service.spec.ts.
 */
function makeService(prisma: PrismaService): AuthService {
  return new AuthService(
    prisma,
    {} as OtpService,
    {} as SessionService,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );
}

/**
 * Sign-up runs inside a transaction (User + roles + seeded notification
 * preferences), so the mock plays the interactive-transaction callback back with
 * a tx client. `createMany` is captured so the preference seeding is assertable.
 */
interface CreateManyArgs {
  data: Array<{ userId: string; channel: string; category: string; enabled: boolean }>;
  skipDuplicates: boolean;
}

type CreateManyMock = jest.Mock<Promise<{ count: number }>, [CreateManyArgs]>;

function makePrisma(
  create: jest.Mock,
  createMany: CreateManyMock = jest
    .fn<Promise<{ count: number }>, [CreateManyArgs]>()
    .mockResolvedValue({ count: 0 }),
): PrismaService {
  const tx = { user: { create }, notificationPreference: { createMany } };
  return {
    client: {
      $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
      ...tx,
    },
  } as unknown as PrismaService;
}

describe('AuthService.signUp', () => {
  it('creates a WORKER identity from the "find_work" intent', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'user-1',
      phone: '+237655555555',
      status: UserStatus.PENDING,
    });
    const service = makeService(makePrisma(create));

    const result = await service.signUp({ roleIntent: 'find_work', phone: '655 555 555' });

    expect(result).toEqual({
      userId: 'user-1',
      phone: '+237655555555',
      role: Role.WORKER,
      status: UserStatus.PENDING,
    });
    // Phone is normalised to E.164. BOTH trading roles are granted — one person
    // is routinely both — and the intent only decides which one starts ACTIVE.
    // No password was supplied, so the identity is OTP-only for now.
    expect(create).toHaveBeenCalledWith({
      data: {
        phone: '+237655555555',
        email: null,
        passwordHash: null,
        passwordUpdatedAt: null,
        status: UserStatus.PENDING,
        roles: {
          create: [
            { role: Role.CLIENT, isActive: false },
            { role: Role.WORKER, isActive: true },
          ],
        },
      },
      select: { id: true, phone: true, status: true },
    });
  });

  it('creates a CLIENT identity from the "hire" intent', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'user-2',
      phone: '+237699999999',
      status: UserStatus.PENDING,
    });
    const service = makeService(makePrisma(create));

    const result = await service.signUp({ roleIntent: 'hire', phone: '+237 699 999 999' });

    expect(result.role).toBe(Role.CLIENT);
    expect(create).toHaveBeenCalledWith({
      data: {
        phone: '+237699999999',
        email: null,
        passwordHash: null,
        passwordUpdatedAt: null,
        status: UserStatus.PENDING,
        roles: {
          create: [
            { role: Role.CLIENT, isActive: true },
            { role: Role.WORKER, isActive: false },
          ],
        },
      },
      select: { id: true, phone: true, status: true },
    });
  });

  it('hashes a supplied password instead of storing it', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'user-4',
      phone: '+237655555555',
      status: UserStatus.PENDING,
    });
    const service = makeService(makePrisma(create));

    await service.signUp({
      roleIntent: 'hire',
      phone: '655555555',
      password: 'correct horse battery',
    });

    const call = create.mock.calls[0] as [
      { data: { passwordHash: string | null; passwordUpdatedAt: Date | null } },
    ];
    const { data } = call[0];

    expect(data.passwordHash).toEqual(expect.stringMatching(/^scrypt\$/));
    expect(data.passwordHash).not.toContain('correct horse battery');
    expect(data.passwordUpdatedAt).toBeInstanceOf(Date);
  });

  it('seeds the default notification preference matrix in the same transaction', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'user-3',
      phone: '+237655555555',
      status: UserStatus.PENDING,
    });
    const createMany: CreateManyMock = jest
      .fn<Promise<{ count: number }>, [CreateManyArgs]>()
      .mockResolvedValue({ count: 55 });
    const service = makeService(makePrisma(create, createMany));

    await service.signUp({ roleIntent: 'find_work', phone: '655 555 555' });

    expect(createMany).toHaveBeenCalledTimes(1);
    const arg = createMany.mock.calls[0]![0];
    expect(arg.skipDuplicates).toBe(true);
    // 5 channels (IN_APP, EMAIL, WEB_PUSH, SMS, WHATSAPP) × 11 categories, every
    // row bound to the new identity. IN_APP is seeded like any other channel —
    // the inbox is a delivery channel, not a special case, so it sits in the
    // same grid (NOT-03).
    expect(arg.data).toHaveLength(55);
    expect(arg.data.every((row) => row.userId === 'user-3')).toBe(true);
    // SMS and WhatsApp are both deferred, so their rows seed disabled.
    expect(arg.data.filter((row) => row.channel === 'SMS').every((row) => !row.enabled)).toBe(true);
    expect(arg.data.filter((row) => row.channel === 'WHATSAPP').every((row) => !row.enabled)).toBe(
      true,
    );
    // The inbox is on by default: it is the fallback when push is denied.
    expect(arg.data.filter((row) => row.channel === 'IN_APP').length).toBe(11);
  });

  it('rejects an invalid phone number with a typed field error', async () => {
    const create = jest.fn();
    const service = makeService(makePrisma(create));

    const error = await service
      .signUp({ roleIntent: 'hire', phone: '12345' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('VALIDATION_ERROR');
    expect((error as AppException).fields?.phone?.length).toBeGreaterThan(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('maps a duplicate phone (P2002) to a 409 conflict', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const create = jest.fn().mockRejectedValue(p2002);
    const service = makeService(makePrisma(create));

    const error = await service
      .signUp({ roleIntent: 'find_work', phone: '655555555' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect((error as AppException).code).toBe('PHONE_ALREADY_REGISTERED');
  });

  it('re-throws unknown database errors untouched', async () => {
    const boom = new Error('connection lost');
    const create = jest.fn().mockRejectedValue(boom);
    const service = makeService(makePrisma(create));

    await expect(service.signUp({ roleIntent: 'hire', phone: '655555555' })).rejects.toBe(boom);
  });
});
