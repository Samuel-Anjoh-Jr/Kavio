import { HttpStatus, Injectable } from '@nestjs/common';
import {
  TeamMemberStatus,
  VerificationCheckType,
  VerificationStatus,
  type Prisma,
} from '@trustpro/database';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { BusinessProfileView } from './models/business-profile.model';

const logger = createLogger('profiles.business');

const SLOW_QUERY_MS = 300;

const BUSINESS_PROFILE_SELECT = {
  id: true,
  ownerId: true,
  name: true,
  description: true,
  rccmNumber: true,
  contactEmail: true,
  contactPhone: true,
  city: true,
  area: true,
  address: true,
  verified: true,
  verifiedAt: true,
  createdAt: true,
  logo: { select: { s3Key: true, visibility: true } },
  owner: {
    select: {
      tier: true,
      trustScore: true,
      trustScoreRecord: {
        select: {
          total: true,
          completedJobs: true,
          averageRating: true,
          suspended: true,
        },
      },
    },
  },
  team: {
    where: { status: TeamMemberStatus.ACTIVE },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { id: true, name: true, role: true, createdAt: true },
  },
  _count: { select: { team: { where: { status: TeamMemberStatus.ACTIVE } } } },
} satisfies Prisma.BusinessProfileSelect;

/**
 * The public business profile read (PROMPT 47; PRO-06).
 *
 * Two queries: the profile graph, and the owner's verification records for the
 * Documents tab. The second cannot be folded into the first because
 * verifications hang off the owning USER, not off the business row.
 *
 * ── Why business trust reads from the OWNER's identity ─────────────────────
 * A company has no Trust Score of its own, and giving it one would be the
 * loophole that undoes progressive verification: register a company, and a
 * freshly-created identity inherits a clean corporate reputation it never
 * earned. Trust attaches to the identity that stands behind the business, which
 * is also the identity that gets suspended if the documents turn out to be fake.
 */
@Injectable()
export class BusinessProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findById(id: string): Promise<BusinessProfileView> {
    return this.load({ id });
  }

  async findByOwnerId(ownerId: string): Promise<BusinessProfileView> {
    return this.load({ ownerId });
  }

  private async load(where: { id?: string; ownerId?: string }): Promise<BusinessProfileView> {
    const started = Date.now();

    const profile = await this.prisma.client.businessProfile.findUnique({
      where: where.id ? { id: where.id } : { ownerId: where.ownerId },
      select: BUSINESS_PROFILE_SELECT,
    });

    if (!profile) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PROFILE_NOT_FOUND',
        'That company profile does not exist.',
      );
    }

    const score = profile.owner.trustScoreRecord;

    if (score?.suspended) {
      logger.warn('Suspended business profile requested', {
        payload: { businessProfileId: profile.id },
      });
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PROFILE_NOT_FOUND',
        'That company profile does not exist.',
      );
    }

    // Only the checks the Documents tab reports on. Fetching every verification
    // to display two of them would pull KYC review history into a public read.
    const credentialChecks = await this.prisma.client.verificationRecord.findMany({
      where: {
        subjectId: profile.ownerId,
        status: VerificationStatus.VERIFIED,
        checkType: {
          in: [VerificationCheckType.BUSINESS_REGISTRATION, VerificationCheckType.ADDRESS],
        },
      },
      orderBy: { reviewedAt: 'desc' },
      select: { checkType: true, reviewedAt: true },
    });

    const durationMs = Date.now() - started;
    if (durationMs > SLOW_QUERY_MS) {
      logger.warn('Slow business profile read', {
        durationMs,
        payload: { businessProfileId: profile.id },
      });
    }

    const latestByCheck = new Map(
      credentialChecks.map((record) => [record.checkType, record.reviewedAt]),
    );

    return {
      id: profile.id,
      ownerId: profile.ownerId,
      name: profile.name,
      description: profile.description,
      logoUrl: profile.logo
        ? await this.storage.urlFor(profile.logo.s3Key, profile.logo.visibility)
        : null,
      contactEmail: profile.contactEmail,
      contactPhone: profile.contactPhone,
      city: profile.city,
      area: profile.area,
      address: profile.address,
      rccmNumber: profile.rccmNumber,
      verified: profile.verified,
      ownerTier: profile.owner.tier,
      createdAt: profile.createdAt,
      stats: {
        teamSize: profile._count.team,
        trustScore: score?.total ?? profile.owner.trustScore,
        completedJobs: score?.completedJobs ?? 0,
        averageRating:
          score?.averageRating === null ? null : Number(score?.averageRating ?? 0) || null,
        // The jobs module is Phase 4. Reporting zero with an explicit
        // `jobsAvailable: false` distinguishes "this company has posted nothing"
        // from "we cannot tell yet" — identical as a bare zero, and the UI needs
        // to render them differently.
        openJobCount: 0,
        jobsAvailable: false,
      },
      team: profile.team.map((member) => ({
        id: member.id,
        name: member.name,
        role: member.role,
        joinedAt: member.createdAt,
        // Deliberately NOT exposed: a team member's email and phone. They were
        // captured to send an invitation, not to be published (BIZ-03).
      })),
      credentials: [
        {
          labelKey: 'credential.rccm',
          // The registration NUMBER is published (it is a public register), but
          // the scan behind it never is — this flag is the whole trust signal.
          verified: latestByCheck.has(VerificationCheckType.BUSINESS_REGISTRATION),
          verifiedAt: latestByCheck.get(VerificationCheckType.BUSINESS_REGISTRATION) ?? null,
        },
        {
          labelKey: 'credential.address',
          verified: latestByCheck.has(VerificationCheckType.ADDRESS),
          verifiedAt: latestByCheck.get(VerificationCheckType.ADDRESS) ?? null,
        },
      ],
    };
  }
}
