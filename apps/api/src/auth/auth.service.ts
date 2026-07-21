import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@trustpro/database';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { normalizeToE164 } from '../lib/phone.util';
import { buildDefaultPreferences } from '../notifications/notification.config';
import { PrismaService } from '../prisma/prisma.service';
import type { RoleIntent, SignUpDto } from './dto/sign-up.dto';

const logger = createLogger('auth');

/** Maps the guest-facing intent to the identity's initial role grant. */
const INTENT_TO_ROLE: Record<RoleIntent, Role> = {
  find_work: Role.WORKER,
  hire: Role.CLIENT,
};

export interface SignUpResult {
  userId: string;
  phone: string;
  role: Role;
  status: UserStatus;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a pending User plus their initial active UserRole. The phone number
   * is normalised to E.164 before it ever reaches the DB. Verification (OTP)
   * and credentials land in later prompts; the account starts PENDING.
   */
  async signUp(dto: SignUpDto): Promise<SignUpResult> {
    const start = Date.now();

    const phone = normalizeToE164(dto.phone);
    if (phone === null) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Check your phone number.',
        {
          phone: ['Enter a valid Cameroon phone number, e.g. +237 6XX XX XX XX.'],
        },
      );
    }

    const role = INTENT_TO_ROLE[dto.roleIntent];

    try {
      // User + initial UserRole + default notification preferences are created
      // atomically: an identity must never exist without its preference matrix,
      // or the dispatcher would fall back to "enabled" for rows it should own
      // (SRS §26.1 — seed default preferences at user creation).
      const user = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            phone,
            status: UserStatus.PENDING,
            roles: { create: { role, isActive: true } },
          },
          select: { id: true, phone: true, status: true },
        });

        await tx.notificationPreference.createMany({
          data: buildDefaultPreferences(created.id),
          skipDuplicates: true,
        });

        return created;
      });

      // Never log the phone number itself (PII); the role + timing are enough.
      logger.info('Sign-up succeeded', {
        durationMs: Date.now() - start,
        result: { userId: user.id, role },
      });

      return {
        userId: user.id,
        phone: user.phone as string,
        role,
        status: user.status,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Unique violation on `phone`: an identity already exists.
        throw new AppException(
          HttpStatus.CONFLICT,
          'PHONE_ALREADY_REGISTERED',
          'That phone number is already registered.',
          { phone: ['This phone number already has an account. Try logging in instead.'] },
        );
      }
      throw error;
    }
  }
}
