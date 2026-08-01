import { HttpStatus, Injectable } from '@nestjs/common';
import { PaymentMethodType } from '@kavio/database';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { AppException } from '../../lib/app-exception';
import { createLogger } from '../../lib/logger';
import { normalizeToE164 } from '../../lib/phone.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AddPaymentMethodDto, UpdatePaymentMethodPhoneDto } from './dto/payment-method.dto';

const logger = createLogger('payment-methods');

const METHOD_SELECT = {
  id: true,
  type: true,
  label: true,
  phone: true,
  maskedAccount: true,
  operator: true,
  isDefault: true,
  createdAt: true,
} as const;

/**
 * Payment-method management (PAY-04): add, remove, set default, with secure
 * storage. A user's first method becomes their default automatically, and the
 * "exactly one default" rule is a partial unique index in the database — this
 * service just flips the old default off in the same transaction so a race can
 * never leave a user with two or none.
 */
@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser) {
    return this.prisma.client.paymentMethod.findMany({
      where: { userId: user.id, isActive: true },
      select: METHOD_SELECT,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async add(user: AuthenticatedUser, dto: AddPaymentMethodDto) {
    const isMomo =
      dto.type === PaymentMethodType.MTN_MOMO || dto.type === PaymentMethodType.ORANGE_MONEY;

    let phone: string | null = null;
    if (isMomo) {
      const normalized = dto.phone ? normalizeToE164(dto.phone) : null;
      if (!normalized) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'INVALID_PHONE',
          'That phone number is not valid.',
          {
            phone: ['Enter a valid Cameroon phone number.'],
          },
        );
      }
      phone = normalized;
    }

    const operator =
      dto.operator ??
      (dto.type === PaymentMethodType.MTN_MOMO
        ? 'MTN'
        : dto.type === PaymentMethodType.ORANGE_MONEY
          ? 'ORANGE'
          : null);

    const label = dto.label?.trim() || this.defaultLabel(dto.type, phone, dto.maskedAccount);

    // First method is default; otherwise honour makeDefault.
    const count = await this.prisma.client.paymentMethod.count({
      where: { userId: user.id, isActive: true },
    });
    const makeDefault = count === 0 ? true : Boolean(dto.makeDefault);

    const created = await this.prisma.client.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.paymentMethod.updateMany({
          where: { userId: user.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.paymentMethod.create({
        data: {
          userId: user.id,
          type: dto.type,
          label,
          phone,
          maskedAccount: dto.maskedAccount?.trim() || null,
          operator,
          isDefault: makeDefault,
        },
        select: METHOD_SELECT,
      });
    });

    logger.info('Payment method added', {
      payload: { userId: user.id, methodId: created.id, type: dto.type },
    });
    return created;
  }

  /**
   * Corrects a Mobile Money method's phone number in place (PAY-04) — what the
   * pre-payout confirmation pop-up calls when someone edits the number rather
   * than just confirming it. Card/bank methods have no phone to update.
   */
  async updatePhone(user: AuthenticatedUser, methodId: string, dto: UpdatePaymentMethodPhoneDto) {
    const method = await this.prisma.client.paymentMethod.findFirst({
      where: { id: methodId, userId: user.id, isActive: true },
      select: { id: true, type: true },
    });
    if (!method) {
      throw this.notFound();
    }

    const isMomo =
      method.type === PaymentMethodType.MTN_MOMO || method.type === PaymentMethodType.ORANGE_MONEY;
    if (!isMomo) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'NOT_A_MOMO_METHOD',
        'Only a Mobile Money method has a phone number to change.',
      );
    }

    const normalized = normalizeToE164(dto.phone);
    if (!normalized) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_PHONE',
        'That phone number is not valid.',
        { phone: ['Enter a valid Cameroon phone number.'] },
      );
    }

    const updated = await this.prisma.client.paymentMethod.update({
      where: { id: methodId },
      data: { phone: normalized },
      select: METHOD_SELECT,
    });

    logger.info('Payment method phone updated', {
      payload: { userId: user.id, methodId },
    });
    return updated;
  }

  /** Sets a method as the user's default, unsetting the previous one atomically. */
  async setDefault(user: AuthenticatedUser, methodId: string) {
    const method = await this.prisma.client.paymentMethod.findFirst({
      where: { id: methodId, userId: user.id, isActive: true },
      select: { id: true },
    });
    if (!method) {
      throw this.notFound();
    }
    await this.prisma.client.$transaction(async (tx) => {
      await tx.paymentMethod.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
      await tx.paymentMethod.update({ where: { id: methodId }, data: { isDefault: true } });
    });
    return this.prisma.client.paymentMethod.findUniqueOrThrow({
      where: { id: methodId },
      select: METHOD_SELECT,
    });
  }

  /**
   * Removes a method (PAY-04). SOFT delete: a Transaction points back at the
   * method it used, and that history must keep resolving. If the removed method
   * was the default, the most recent remaining one is promoted so the user is
   * never left without a default.
   */
  async remove(user: AuthenticatedUser, methodId: string): Promise<{ id: string }> {
    const method = await this.prisma.client.paymentMethod.findFirst({
      where: { id: methodId, userId: user.id, isActive: true },
      select: { id: true, isDefault: true },
    });
    if (!method) {
      throw this.notFound();
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.paymentMethod.update({
        where: { id: methodId },
        data: { isActive: false, isDefault: false },
      });
      if (method.isDefault) {
        const next = await tx.paymentMethod.findFirst({
          where: { userId: user.id, isActive: true },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (next) {
          await tx.paymentMethod.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
    });

    logger.info('Payment method removed', { payload: { userId: user.id, methodId } });
    return { id: methodId };
  }

  /** Resolves the method a payment should use: the given id, or the default. */
  async resolveForPayment(
    userId: string,
    methodId: string | undefined,
  ): Promise<{ id: string; type: PaymentMethodType; phone: string | null }> {
    const method = methodId
      ? await this.prisma.client.paymentMethod.findFirst({
          where: { id: methodId, userId, isActive: true },
          select: { id: true, type: true, phone: true },
        })
      : await this.prisma.client.paymentMethod.findFirst({
          where: { userId, isActive: true, isDefault: true },
          select: { id: true, type: true, phone: true },
        });
    if (!method) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'NO_PAYMENT_METHOD',
        'Add a payment method first.',
      );
    }
    return method;
  }

  private defaultLabel(
    type: PaymentMethodType,
    phone: string | null,
    masked: string | undefined,
  ): string {
    const tail = phone ? phone.slice(-4) : masked ? masked.slice(-4) : '';
    switch (type) {
      case PaymentMethodType.MTN_MOMO:
        return `MTN MoMo ••${tail}`;
      case PaymentMethodType.ORANGE_MONEY:
        return `Orange Money ••${tail}`;
      case PaymentMethodType.CARD:
        return `Card ••${tail}`;
      case PaymentMethodType.BANK:
        return `Bank ••${tail}`;
    }
  }

  private notFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      'PAYMENT_METHOD_NOT_FOUND',
      'That payment method was not found.',
    );
  }
}
