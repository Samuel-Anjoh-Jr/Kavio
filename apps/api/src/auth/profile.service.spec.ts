import { Prisma } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import type { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from './profile.service';

process.env.AUTH_SECRET_PEPPER = 'test-pepper';

function makeService(update: jest.Mock) {
  const prisma = { client: { user: { update } } } as unknown as PrismaService;
  return new ProfileService(prisma);
}

describe('ProfileService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('updateName', () => {
    it('trims and saves the display name', async () => {
      const update = jest.fn().mockResolvedValue({});
      const service = makeService(update);

      const result = await service.updateName('user-1', { name: '  Amina N.  ' });

      expect(result).toEqual({ name: 'Amina N.' });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { name: 'Amina N.' },
      });
    });
  });

  describe('changePhone', () => {
    it('normalises the number and clears phoneVerifiedAt', async () => {
      const update = jest.fn().mockResolvedValue({});
      const service = makeService(update);

      const result = await service.changePhone('user-1', { phone: '655 555 555' });

      expect(result).toEqual({ phone: '+237655555555' });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { phone: '+237655555555', phoneVerifiedAt: null },
      });
    });

    it('rejects a number that cannot be normalised', async () => {
      const update = jest.fn();
      const service = makeService(update);

      const error = await service.changePhone('user-1', { phone: '123' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe('VALIDATION_ERROR');
      expect(update).not.toHaveBeenCalled();
    });

    it('reports a conflict when the number already belongs to another account', async () => {
      const update = jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['phone'] },
        }),
      );
      const service = makeService(update);

      const error = await service
        .changePhone('user-1', { phone: '655555555' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe('PHONE_ALREADY_REGISTERED');
    });

    it('refuses the free-edit path once SMS is live', async () => {
      process.env.NOTIFICATIONS_SMS_ENABLED = 'true';
      const update = jest.fn();
      const service = makeService(update);

      const error = await service
        .changePhone('user-1', { phone: '655555555' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe('PHONE_CHANGE_VERIFICATION_REQUIRED');
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses the free-edit path once WhatsApp is live', async () => {
      process.env.NOTIFICATIONS_WHATSAPP_ENABLED = 'true';
      const update = jest.fn();
      const service = makeService(update);

      const error = await service
        .changePhone('user-1', { phone: '655555555' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe('PHONE_CHANGE_VERIFICATION_REQUIRED');
      expect(update).not.toHaveBeenCalled();
    });
  });
});
