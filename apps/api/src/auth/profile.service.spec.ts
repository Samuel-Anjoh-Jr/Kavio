import { Prisma } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { ProfileService } from './profile.service';

process.env.AUTH_SECRET_PEPPER = 'test-pepper';

function makeService(update: jest.Mock, findFirst: jest.Mock = jest.fn()) {
  const prisma = {
    client: { user: { update }, mediaAsset: { findFirst } },
  } as unknown as PrismaService;
  const storage = {
    urlFor: jest.fn((key: string) => Promise.resolve(`https://cdn.example/${key}`)),
  } as unknown as StorageService;
  return new ProfileService(prisma, storage);
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

  describe('updateAvatar', () => {
    it("sets the public URL of the user's own profile photo", async () => {
      const update = jest.fn().mockResolvedValue({});
      const findFirst = jest.fn().mockResolvedValue({ s3Key: 'avatars/u1.jpg' });
      const service = makeService(update, findFirst);

      const result = await service.updateAvatar('user-1', {
        assetId: '7a7b7c7d-0000-4000-8000-000000000001',
      });

      expect(result).toEqual({ avatar: 'https://cdn.example/avatars/u1.jpg' });
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: 'user-1', kind: 'PROFILE_PHOTO' }),
        }),
      );
    });

    it("refuses an asset that is not the user's profile photo", async () => {
      const service = makeService(jest.fn(), jest.fn().mockResolvedValue(null));
      await expect(
        service.updateAvatar('user-1', { assetId: '7a7b7c7d-0000-4000-8000-000000000002' }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('removes the photo', async () => {
      const update = jest.fn().mockResolvedValue({});
      const service = makeService(update);
      await expect(service.updateAvatar('user-1', { assetId: null })).resolves.toEqual({
        avatar: null,
      });
      expect(update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { avatar: null } });
    });
  });
});
