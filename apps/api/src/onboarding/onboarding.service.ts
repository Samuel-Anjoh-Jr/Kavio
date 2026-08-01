import { HttpStatus, Injectable } from '@nestjs/common';
import {
  LocationSource,
  MediaAssetKind,
  OnboardingRole,
  PortfolioItemType,
  Prisma,
  Role,
  TeamMemberAccessLevel,
  TeamMemberRole,
  VerificationCheckType,
} from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { VerificationService } from '../verification/verification.service';
import {
  completedStepKeys,
  computeCompletion,
  firstStepKey,
  missingRequiredSteps,
  nextStepKey,
  ONBOARDING_UNLOCKS,
  stepsFor,
} from './onboarding.steps';

const logger = createLogger('onboarding');

export interface OnboardingView {
  role: OnboardingRole;
  currentStep: string;
  completionPercent: number;
  completedAt: Date | null;
  completedSteps: string[];
  data: Record<string, unknown>;
  unlocks: { key: string; threshold: number; unlocked: boolean }[];
}

/** The role a user must actually hold to run a given onboarding flow. */
const REQUIRED_ROLE: Record<OnboardingRole, Role> = {
  [OnboardingRole.WORKER]: Role.WORKER,
  [OnboardingRole.CLIENT]: Role.CLIENT,
  [OnboardingRole.BUSINESS]: Role.BUSINESS,
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: VerificationService,
  ) {}

  /**
   * Reads progress. Deliberately does NOT create a row: a GET must not write,
   * and an identity that has merely looked at onboarding should not be
   * indistinguishable from one that started it.
   */
  async get(userId: string, role: OnboardingRole): Promise<OnboardingView> {
    const record = await this.prisma.client.onboardingProgress.findUnique({
      where: { userId_role: { userId, role } },
      select: { currentStep: true, data: true, completionPercent: true, completedAt: true },
    });

    const data = (record?.data as Record<string, unknown> | undefined) ?? {};

    return this.toView(role, data, record?.completedAt ?? null, record?.currentStep);
  }

  /**
   * Autosaves one step (ACC-10 "autosave each step; allow resume").
   *
   * The step's slice is validated and MERGED at the top level, so a stale tab
   * saving an old step cannot wipe answers given on a different one. The
   * completion percentage is always recomputed here from the merged result and
   * never taken from the request.
   */
  async saveStep(
    userId: string,
    role: OnboardingRole,
    stepKey: string,
    payload: Record<string, unknown>,
  ): Promise<OnboardingView> {
    const step = stepsFor(role).find((candidate) => candidate.key === stepKey);

    if (!step) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'UNKNOWN_STEP',
        'That onboarding step does not exist.',
      );
    }

    const parsed = step.schema.safeParse(payload);
    if (!parsed.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.length > 0 ? issue.path.join('.') : '_';
        (fields[key] ??= []).push(issue.message);
      }
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Some fields need your attention.',
        fields,
      );
    }

    const existing = await this.prisma.client.onboardingProgress.findUnique({
      where: { userId_role: { userId, role } },
      select: { data: true, completedAt: true },
    });

    const merged = {
      ...((existing?.data as Record<string, unknown> | undefined) ?? {}),
      ...(parsed.data as Record<string, unknown>),
    };

    const completionPercent = computeCompletion(role, merged);
    const currentStep = nextStepKey(role, merged);

    await this.prisma.client.onboardingProgress.upsert({
      where: { userId_role: { userId, role } },
      create: {
        userId,
        role,
        currentStep,
        data: merged as Prisma.InputJsonValue,
        completionPercent,
      },
      update: {
        currentStep,
        data: merged as Prisma.InputJsonValue,
        completionPercent,
      },
    });

    logger.info('Onboarding step saved', {
      result: { userId, role, stepKey, completionPercent },
    });

    return this.toView(role, merged, existing?.completedAt ?? null, currentStep);
  }

  /**
   * Finishes onboarding and materialises the answers into the typed profile
   * models. Everything happens in ONE transaction: a WorkerProfile without its
   * services, or a completion flag without a profile, would both be worse than
   * failing outright and letting the user press the button again.
   */
  async complete(userId: string, role: OnboardingRole): Promise<OnboardingView> {
    const record = await this.prisma.client.onboardingProgress.findUnique({
      where: { userId_role: { userId, role } },
      select: { data: true, completedAt: true },
    });

    const data = (record?.data as Record<string, unknown> | undefined) ?? {};
    const missing = missingRequiredSteps(role, data);

    if (missing.length > 0) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ONBOARDING_INCOMPLETE',
        'A few required steps are still missing.',
        { steps: missing },
      );
    }

    const completedAt = record?.completedAt ?? new Date();
    const completionPercent = computeCompletion(role, data);

    await this.prisma.client.$transaction(async (tx) => {
      if (role === OnboardingRole.WORKER) {
        await this.materialiseWorker(tx, userId, data);
      } else if (role === OnboardingRole.CLIENT) {
        await this.materialiseClient(tx, userId, data);
      } else {
        await this.materialiseBusiness(tx, userId, data);
      }

      await tx.onboardingProgress.upsert({
        where: { userId_role: { userId, role } },
        create: {
          userId,
          role,
          currentStep: nextStepKey(role, data),
          data: data as Prisma.InputJsonValue,
          completionPercent,
          completedAt,
        },
        update: { completionPercent, completedAt },
      });
    });

    // Outside the transaction above: VerificationService.submit runs its own
    // OCR pass, trust-ledger writes and event emission, none of which belong
    // inside the profile-materialisation transaction. The identity/documents
    // steps only ever collected these asset ids for this exact purpose — a
    // worker or business finishing onboarding expects the files they just
    // uploaded to actually be in the review queue, not sitting unsubmitted.
    if (role === OnboardingRole.WORKER) {
      await this.submitWorkerVerifications(userId, data);
    } else if (role === OnboardingRole.BUSINESS) {
      await this.submitBusinessVerification(userId, data);
    }

    logger.info('Onboarding completed', { result: { userId, role, completionPercent } });

    return this.toView(role, data, completedAt, nextStepKey(role, data));
  }

  /** Rejects a flow the caller does not hold the matching role for (RBAC). */
  assertRoleAllowed(user: { roles: Role[] }, role: OnboardingRole): void {
    if (!user.roles.includes(REQUIRED_ROLE[role])) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'ROLE_NOT_GRANTED',
        'You do not have that role yet.',
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Materialisation
  // ───────────────────────────────────────────────────────────────────────────

  private async materialiseWorker(
    tx: Prisma.TransactionClient,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const location = (data.location ?? {}) as Record<string, unknown>;

    const profile = await tx.workerProfile.upsert({
      where: { userId },
      create: { userId, ...this.locationFields(location) },
      update: this.locationFields(location),
      select: { id: true },
    });

    const services = (data.services ?? []) as {
      name: string;
      description?: string;
      startingPrice?: number;
    }[];

    // Replace rather than merge: the onboarding payload is the complete stated
    // set, so a service the user removed must actually disappear.
    await tx.service.deleteMany({ where: { workerProfileId: profile.id } });
    if (services.length > 0) {
      await tx.service.createMany({
        data: services.map((service) => ({
          workerProfileId: profile.id,
          name: service.name,
          description: service.description ?? null,
          startingPrice: service.startingPrice ?? null,
        })),
      });
    }

    const availability = (data.availability ?? []) as {
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }[];

    await tx.availability.deleteMany({ where: { workerProfileId: profile.id } });
    if (availability.length > 0) {
      await tx.availability.createMany({
        data: availability.map((slot) => ({ workerProfileId: profile.id, ...slot })),
        // Identical slots entered twice are a user slip, not an error worth
        // failing the whole completion over.
        skipDuplicates: true,
      });
    }

    const portfolio = (data.portfolio ?? []) as {
      mediaAssetId: string;
      caption?: string;
      type?: PortfolioItemType;
      groupKey?: string;
    }[];

    await tx.portfolioItem.deleteMany({ where: { workerProfileId: profile.id } });

    if (portfolio.length > 0) {
      // Only assets this user owns may be attached — otherwise a guessed id
      // would let someone mount another worker's photos on their own profile.
      const owned = await tx.mediaAsset.findMany({
        where: {
          ownerId: userId,
          kind: MediaAssetKind.PORTFOLIO_IMAGE,
          id: { in: portfolio.map((item) => item.mediaAssetId) },
        },
        select: { id: true },
      });
      const ownedIds = new Set(owned.map((asset) => asset.id));

      const attachable = portfolio.filter((item) => ownedIds.has(item.mediaAssetId));
      if (attachable.length > 0) {
        await tx.portfolioItem.createMany({
          data: attachable.map((item) => ({
            workerProfileId: profile.id,
            mediaAssetId: item.mediaAssetId,
            caption: item.caption ?? null,
            type: item.type ?? PortfolioItemType.PHOTO,
            groupKey: item.groupKey ?? null,
          })),
        });
      }
    }
  }

  /**
   * Submits the identity step's uploaded documents for review (TRU-06).
   *
   * ID_APPROVED needs both sides of the national ID; the identity step itself
   * only requires the front plus a selfie to count as "complete" (its back is
   * genuinely optional there), so a missing back simply means this specific
   * check waits — the worker can still finish the rest of onboarding and add
   * it later from the standalone verification screen.
   */
  private async submitWorkerVerifications(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.submitPersonalIdentity(userId, data);

    const portfolio = (data.portfolio ?? []) as ReadonlyArray<{ mediaAssetId?: string }>;
    const portfolioAssetIds = portfolio
      .map((item) => item.mediaAssetId)
      .filter((id): id is string => Boolean(id));

    if (portfolioAssetIds.length > 0) {
      // Not staff-reviewed: submit() settles PORTFOLIO as VERIFIED immediately,
      // which is what feeds the TIER_2 gate (TierConfig requires ID_APPROVED +
      // PORTFOLIO) — without this, a worker's portfolio images never become a
      // check the tier can see, no matter how many are uploaded.
      await this.trySubmitVerification(
        { id: userId } as AuthenticatedUser,
        VerificationCheckType.PORTFOLIO,
        portfolioAssetIds,
      );
    }
  }

  /**
   * Submits the documents step's registration upload, and the owner's own
   * identity, for review (BIZ-01).
   *
   * JobPostingGateService.check() requires a verified BusinessProfile AND the
   * owner's ID_APPROVED before the public board unlocks — a paperwork-only
   * business could complete every step here and still never satisfy that gate
   * without this half.
   */
  private async submitBusinessVerification(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.submitPersonalIdentity(userId, data);

    const documents = (data.documents ?? {}) as { registrationAssetId?: string };

    if (documents.registrationAssetId) {
      await this.trySubmitVerification(
        { id: userId } as AuthenticatedUser,
        VerificationCheckType.BUSINESS_REGISTRATION,
        [documents.registrationAssetId],
      );
    }
  }

  /** The identity step is shared verbatim between the worker and business flows. */
  private async submitPersonalIdentity(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const identity = (data.identity ?? {}) as {
      idFrontAssetId?: string;
      idBackAssetId?: string;
      selfieAssetId?: string;
    };
    const subject = { id: userId } as AuthenticatedUser;

    if (identity.idFrontAssetId && identity.idBackAssetId) {
      await this.trySubmitVerification(subject, VerificationCheckType.ID_APPROVED, [
        identity.idFrontAssetId,
        identity.idBackAssetId,
      ]);
    }

    if (identity.selfieAssetId) {
      await this.trySubmitVerification(subject, VerificationCheckType.SELFIE_LIVENESS, [
        identity.selfieAssetId,
      ]);
    }
  }

  /**
   * Re-finishing onboarding (editing another step, pressing Finish again)
   * must not fail the whole completion just because these exact documents
   * were already submitted or decided — that is a normal repeat, not an error
   * the user caused.
   */
  private async trySubmitVerification(
    subject: AuthenticatedUser,
    checkType: VerificationCheckType,
    documentIds: readonly string[],
  ): Promise<void> {
    try {
      await this.verification.submit(subject, checkType, documentIds);
    } catch (error) {
      logger.warn('Onboarding verification submission skipped', {
        payload: {
          userId: subject.id,
          checkType,
          reason: error instanceof AppException ? error.code : 'UNKNOWN_ERROR',
        },
      });
    }
  }

  private async materialiseClient(
    tx: Prisma.TransactionClient,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const profile = (data.profile ?? {}) as { displayName?: string };
    const location = (data.location ?? {}) as Record<string, unknown>;

    const fields = {
      displayName: profile.displayName ?? null,
      ...this.locationFields(location),
    };

    await tx.clientProfile.upsert({
      where: { userId },
      create: { userId, ...fields },
      update: fields,
    });
  }

  private async materialiseBusiness(
    tx: Prisma.TransactionClient,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const company = (data.company ?? {}) as Record<string, string | undefined>;
    const location = { city: company.city, source: 'HUMAN_INPUT' };

    const fields = {
      name: company.name ?? '',
      description: company.description ?? null,
      rccmNumber: company.rccmNumber ?? null,
      taxId: company.taxId ?? null,
      contactEmail: company.contactEmail ?? null,
      contactPhone: company.contactPhone ?? null,
      address: company.address ?? null,
      ...this.locationFields(location),
    };

    const profile = await tx.businessProfile.upsert({
      where: { ownerId: userId },
      create: { ownerId: userId, ...fields },
      update: fields,
      select: { id: true },
    });

    const team = (data.team ?? []) as {
      name: string;
      email?: string;
      phone?: string;
      role?: TeamMemberRole;
      accessLevel?: TeamMemberAccessLevel;
    }[];

    await tx.businessTeamMember.deleteMany({ where: { businessProfileId: profile.id } });
    if (team.length > 0) {
      await tx.businessTeamMember.createMany({
        data: team.map((member) => ({
          businessProfileId: profile.id,
          name: member.name,
          email: member.email ?? null,
          phone: member.phone ?? null,
          role: member.role ?? TeamMemberRole.STAFF,
          accessLevel: member.accessLevel ?? TeamMemberAccessLevel.VIEW_ONLY,
        })),
      });
    }
  }

  private locationFields(location: Record<string, unknown>) {
    const source = location.source;

    return {
      city: typeof location.city === 'string' ? location.city : null,
      area: typeof location.area === 'string' ? location.area : null,
      latitude: typeof location.latitude === 'number' ? location.latitude : null,
      longitude: typeof location.longitude === 'number' ? location.longitude : null,
      locationSource:
        typeof source === 'string' && source in LocationSource
          ? LocationSource[source as keyof typeof LocationSource]
          : null,
    };
  }

  private toView(
    role: OnboardingRole,
    data: Record<string, unknown>,
    completedAt: Date | null,
    currentStep?: string,
  ): OnboardingView {
    const completionPercent = computeCompletion(role, data);

    return {
      role,
      currentStep:
        currentStep ??
        (Object.keys(data).length > 0 ? nextStepKey(role, data) : firstStepKey(role)),
      completionPercent,
      completedAt,
      completedSteps: completedStepKeys(role, data),
      data,
      unlocks: ONBOARDING_UNLOCKS[role].map((unlock) => ({
        ...unlock,
        unlocked: completionPercent >= unlock.threshold,
      })),
    };
  }
}
