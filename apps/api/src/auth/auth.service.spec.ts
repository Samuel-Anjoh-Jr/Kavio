import { HttpStatus } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@trustpro/database';
import { AppException } from '../lib/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

function makePrisma(create: jest.Mock): PrismaService {
  return { client: { user: { create } } } as unknown as PrismaService;
}

describe('AuthService.signUp', () => {
  it('creates a WORKER identity from the "find_work" intent', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'user-1',
      phone: '+237655555555',
      status: UserStatus.PENDING,
    });
    const service = new AuthService(makePrisma(create));

    const result = await service.signUp({ roleIntent: 'find_work', phone: '655 555 555' });

    expect(result).toEqual({
      userId: 'user-1',
      phone: '+237655555555',
      role: Role.WORKER,
      status: UserStatus.PENDING,
    });
    // Phone is normalised to E.164 and the initial role is active + pending.
    expect(create).toHaveBeenCalledWith({
      data: {
        phone: '+237655555555',
        status: UserStatus.PENDING,
        roles: { create: { role: Role.WORKER, isActive: true } },
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
    const service = new AuthService(makePrisma(create));

    const result = await service.signUp({ roleIntent: 'hire', phone: '+237 699 999 999' });

    expect(result.role).toBe(Role.CLIENT);
    expect(create).toHaveBeenCalledWith({
      data: {
        phone: '+237699999999',
        status: UserStatus.PENDING,
        roles: { create: { role: Role.CLIENT, isActive: true } },
      },
      select: { id: true, phone: true, status: true },
    });
  });

  it('rejects an invalid phone number with a typed field error', async () => {
    const create = jest.fn();
    const service = new AuthService(makePrisma(create));

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
    const service = new AuthService(makePrisma(create));

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
    const service = new AuthService(makePrisma(create));

    await expect(service.signUp({ roleIntent: 'hire', phone: '655555555' })).rejects.toBe(boom);
  });
});
