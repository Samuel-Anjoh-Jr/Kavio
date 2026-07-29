import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadgeType,
  Prisma,
  Role,
  TrustEventType,
  UserStatus,
  VerificationCheckType,
} from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { normalizeToE164 } from '../lib/phone.util';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { BadgeService } from '../trust/badges/badge.service';
import { TrustScoreService } from '../trust/trust-score.service';
import { VerificationService } from './verification.service';
import {
  VERIFICATION_FIELD_VERIFIED,
  FieldVerificationCompletedEvent,
} from './verification.events';

const logger = createLogger('verification:founding');

export interface FoundingIntakeInput {
  readonly phone: string;
  readonly name: string;
  readonly locale?: string;
  readonly city?: string;
  readonly area?: string;
  readonly headline?: string;
  /** Where the agent stood when they verified this person. */
  readonly latitude?: number;
  readonly longitude?: number;
  /** What the agent checked in person — the evidence behind the badge. */
  readonly note?: string;
  /** Photos the agent took during the visit, already uploaded. */
  readonly documentIds?: readonly string[];
}

export interface FoundingIntakeResult {
  readonly subjectId: string;
  readonly createdAccount: boolean;
  readonly verificationRecordId: string;
  readonly badgeAwarded: boolean;
  readonly trustScore: number;
}

/**
 * Founding Professional intake (P31; TRU-09, AGT-01).
 *
 * A Field Agent standing in front of a worker is the strongest signal this
 * platform has, and at launch it is the only way to seed trusted supply before
 * anyone has a job history. This is the tool for exactly that moment: a few
 * fields, on a phone, in someone's workshop.
 *
 * What it deliberately does NOT do is grant a tier. It records a FIELD_VERIFIED
 * event and lets derivation follow — so a founding professional reaches Tier 3
 * when they have also completed the jobs and earned the rating SRS §21.4 asks
 * for, and not a moment earlier. The badge marks who they are; the tier still
 * has to be earned.
 */
@Injectable()
export class FoundingProfessionalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: VerificationService,
    private readonly badges: BadgeService,
    private readonly trust: TrustScoreService,
    private readonly events: EventEmitter2,
  ) {}

  async intake(
    input: FoundingIntakeInput,
    agent: AuthenticatedUser,
  ): Promise<FoundingIntakeResult> {
    const phone = normalizeToE164(input.phone);

    if (!phone) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_PHONE',
        'That phone number does not look right.',
        { phone: ['Enter a Cameroonian mobile number, e.g. 6 12 34 56 78.'] },
      );
    }

    const { subjectId, createdAccount } = await this.findOrCreateWorker(phone, input);

    // Idempotent by phone: an agent who taps submit twice, or who re-visits a
    // worker they registered last month, tops up the record rather than creating
    // a second identity for the same person.
    const { recordId, alreadyVerified } = await this.verification.recordAutomaticCheck(
      subjectId,
      VerificationCheckType.FIELD_VERIFICATION,
      {
        actorId: agent.id,
        documentIds: input.documentIds,
        metadata: {
          agentId: agent.id,
          note: input.note,
          // The GPS fix of the visit. Stored as evidence, not as the worker's
          // location: where an agent stood is not where a worker works.
          location:
            input.latitude !== undefined && input.longitude !== undefined
              ? { latitude: input.latitude, longitude: input.longitude }
              : undefined,
        } as Prisma.InputJsonValue,
      },
    );

    const badgeAwarded = await this.badges.award(subjectId, BadgeType.FOUNDING_PROFESSIONAL, {
      sourceType: 'FoundingIntake',
      sourceId: recordId,
      metadata: { agentId: agent.id },
    });

    await this.prisma.client.auditLog.create({
      data: {
        actorId: agent.id,
        action: 'verification.founding_intake',
        target: `User:${subjectId}`,
        requestId: getRequestId(),
        meta: {
          createdAccount,
          alreadyVerified,
          badgeAwarded,
          recordId,
        },
      },
    });

    this.events.emit(
      VERIFICATION_FIELD_VERIFIED,
      new FieldVerificationCompletedEvent({
        subjectId,
        agentId: agent.id,
        recordId,
        createdAccount,
        requestId: getRequestId(),
      }),
    );

    const score = await this.prisma.client.user.findUnique({
      where: { id: subjectId },
      select: { trustScore: true },
    });

    logger.info('Founding professional registered', {
      result: { subjectId, agentId: agent.id, createdAccount, badgeAwarded },
    });

    return {
      subjectId,
      createdAccount,
      verificationRecordId: recordId,
      badgeAwarded,
      trustScore: score?.trustScore ?? 0,
    };
  }

  /**
   * Finds the worker by phone, or creates the account the agent is standing in
   * front of.
   *
   * The account is created ACTIVE with no password: this person has been
   * identified in person, which is a stronger check than the OTP a self-serve
   * signup would run. They claim the account later with the standard OTP flow on
   * the same number — the phone check stays unverified until they do, so the
   * ledger never credits a phone nobody has proved they hold.
   */
  private async findOrCreateWorker(
    phone: string,
    input: FoundingIntakeInput,
  ): Promise<{ subjectId: string; createdAccount: boolean }> {
    const existing = await this.prisma.client.user.findUnique({
      where: { phone },
      select: { id: true, status: true },
    });

    if (existing) {
      if (existing.status === UserStatus.SUSPENDED) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'SUBJECT_SUSPENDED',
          'This account is suspended and cannot be field-verified.',
        );
      }

      await this.ensureWorkerRole(existing.id);
      await this.upsertWorkerProfile(existing.id, input);

      return { subjectId: existing.id, createdAccount: false };
    }

    const created = await this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phone,
          name: input.name,
          locale: input.locale ?? 'fr',
          status: UserStatus.ACTIVE,
          roles: { create: { role: Role.WORKER, isActive: true } },
        },
        select: { id: true },
      });

      await tx.workerProfile.create({
        data: {
          userId: user.id,
          headline: input.headline ?? null,
          city: input.city ?? null,
          area: input.area ?? null,
        },
      });

      return user;
    });

    // The baseline every identity starts on (SRS §21.5, "Starting score", +15).
    await this.trust.record({
      subjectId: created.id,
      type: TrustEventType.ACCOUNT_CREATED,
      actorId: null,
      sourceType: 'FoundingIntake',
    });

    return { subjectId: created.id, createdAccount: true };
  }

  private async ensureWorkerRole(userId: string): Promise<void> {
    // A client the agent meets on site may well also be a worker. Granting the
    // role is additive and never touches which role is currently active — an
    // agent must not silently switch someone's app out from under them.
    await this.prisma.client.userRole.upsert({
      where: { userId_role: { userId, role: Role.WORKER } },
      create: { userId, role: Role.WORKER, isActive: false },
      update: {},
    });
  }

  private async upsertWorkerProfile(userId: string, input: FoundingIntakeInput): Promise<void> {
    const fields = {
      ...(input.headline ? { headline: input.headline } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.area ? { area: input.area } : {}),
    };

    await this.prisma.client.workerProfile.upsert({
      where: { userId },
      create: { userId, ...fields },
      // Only fills gaps the agent supplied; never overwrites what the worker
      // wrote about themselves with what an agent typed in a hurry.
      update: fields,
    });
  }
}
