import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { normalizeToE164 } from '../lib/phone.util';
import { isSmsEnabled, isWhatsappEnabled } from '../notifications/notification.config';
import { PrismaService } from '../prisma/prisma.service';
import type { ChangePhoneDto, UpdateProfileDto } from './dto/auth.dto';

const logger = createLogger('auth:profile');

/**
 * Self-service identity edits: display name and phone number, both editable
 * from profile settings rather than only once during sign-up or onboarding.
 *
 * The phone number stays a free edit — no re-verification round trip — while
 * SMS and WhatsApp are both feature-flagged off (CLAUDE.md: SMS is deferred):
 * there is no channel left to prove a NEW number against, so demanding one
 * would just strand the user. `phoneVerifiedAt` is still cleared on every
 * change, because whatever was proven about the old number says nothing about
 * this one. The moment either channel goes live this stops being a free edit
 * (see the guard in `changePhone`), matching the re-verification CLAUDE.md
 * calls for once a channel can actually prove a number — that flow does not
 * exist yet because there is nothing live to build or test it against today.
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async updateName(userId: string, dto: UpdateProfileDto): Promise<{ name: string }> {
    const name = dto.name.trim();

    await this.prisma.client.user.update({
      where: { id: userId },
      data: { name },
    });

    logger.info('Profile name updated', { result: { userId } });

    return { name };
  }

  async changePhone(userId: string, dto: ChangePhoneDto): Promise<{ phone: string }> {
    const phone = normalizeToE164(dto.phone);
    if (phone === null) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Check your phone number.',
        { phone: ['Enter a valid Cameroon phone number, e.g. +237 6XX XX XX XX.'] },
      );
    }

    if (isSmsEnabled() || isWhatsappEnabled()) {
      // A live channel can now prove a number, so a silent free edit would be
      // wrong — but nothing here has ever sent a code to an unowned number.
      // Fail loudly rather than ship an unverified change once this becomes
      // reachable, so whoever flips the flag sees exactly what still needs
      // building instead of a quietly weakened guarantee.
      throw new AppException(
        HttpStatus.NOT_IMPLEMENTED,
        'PHONE_CHANGE_VERIFICATION_REQUIRED',
        'Changing your phone number now requires verifying the new one first, and that step is not built yet.',
      );
    }

    try {
      await this.prisma.client.user.update({
        where: { id: userId },
        data: { phone, phoneVerifiedAt: null },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'PHONE_ALREADY_REGISTERED',
          'That phone number is already registered.',
          { phone: ['This phone number already has an account.'] },
        );
      }
      throw error;
    }

    logger.info('Phone number changed', { result: { userId } });

    return { phone };
  }
}
