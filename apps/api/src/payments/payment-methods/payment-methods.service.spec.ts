import { PaymentMethodType } from '@kavio/database';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { AppException } from '../../lib/app-exception';
import type { PrismaService } from '../../prisma/prisma.service';
import { PaymentMethodsService } from './payment-methods.service';

const USER = { id: 'user-1' } as AuthenticatedUser;

function makeService(options: { findFirst: jest.Mock; update?: jest.Mock }) {
  const prisma = {
    client: {
      paymentMethod: {
        findFirst: options.findFirst,
        update: options.update ?? jest.fn(),
      },
    },
  } as unknown as PrismaService;
  return new PaymentMethodsService(prisma);
}

describe('PaymentMethodsService.updatePhone', () => {
  it('normalises and saves a new number for a Mobile Money method', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'method-1', type: PaymentMethodType.MTN_MOMO });
    const update = jest.fn().mockResolvedValue({ id: 'method-1', phone: '+237655555555' });
    const service = makeService({ findFirst, update });

    const result = await service.updatePhone(USER, 'method-1', { phone: '655 555 555' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'method-1' },
      data: { phone: '+237655555555' },
      select: expect.any(Object),
    });
    expect(result).toEqual({ id: 'method-1', phone: '+237655555555' });
  });

  it('rejects an unknown or someone-else-owned method', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = makeService({ findFirst });

    const error = await service
      .updatePhone(USER, 'method-404', { phone: '655555555' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('PAYMENT_METHOD_NOT_FOUND');
  });

  it('refuses to set a phone on a card or bank method', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'method-2', type: PaymentMethodType.CARD });
    const update = jest.fn();
    const service = makeService({ findFirst, update });

    const error = await service
      .updatePhone(USER, 'method-2', { phone: '655555555' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('NOT_A_MOMO_METHOD');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a number that cannot be normalised', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'method-1', type: PaymentMethodType.ORANGE_MONEY });
    const update = jest.fn();
    const service = makeService({ findFirst, update });

    const error = await service
      .updatePhone(USER, 'method-1', { phone: '123' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('INVALID_PHONE');
    expect(update).not.toHaveBeenCalled();
  });
});
