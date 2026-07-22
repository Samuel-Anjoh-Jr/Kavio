import { HttpStatus, Injectable } from '@nestjs/common';
import { TeamMemberStatus } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import {
  canPerform,
  capabilitiesFor,
  type BusinessAccess,
  type BusinessCapability,
} from './business-access.model';

const logger = createLogger('business:access');

/**
 * Resolves "who is this caller, to this business?" (BIZ-03).
 *
 * Every business-scoped write goes through {@link require}. The controller's
 * RBAC guard answers the coarse question — does this role manage businesses at
 * all — and this answers the one that actually matters: does THIS identity hold
 * THIS capability for THIS company. The same split the rest of the codebase uses
 * for resource-level authorisation (see EscrowService.loadPartyHold): guards stop
 * the wrong kind of caller, services stop the wrong caller.
 *
 * Refusals are 404, not 403, whenever the caller has no relationship to the
 * business: a 403 confirms the company exists and that the caller found a real
 * id, which is a membership oracle nobody needs.
 */
@Injectable()
export class BusinessAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The caller's standing with one business, or null if they have none.
   *
   * Ownership is checked first and short-circuits: an owner who also holds a
   * (stale, removed) team row is still the owner.
   */
  async resolve(userId: string, businessProfileId: string): Promise<BusinessAccess | null> {
    const business = await this.prisma.client.businessProfile.findUnique({
      where: { id: businessProfileId },
      select: { id: true, ownerId: true },
    });

    if (!business) {
      return null;
    }

    if (business.ownerId === userId) {
      return {
        businessProfileId: business.id,
        userId,
        isOwner: true,
        accessLevel: null,
        memberId: null,
      };
    }

    const membership = await this.prisma.client.businessTeamMember.findFirst({
      where: {
        businessProfileId: business.id,
        userId,
        // ACTIVE only. An invitation that was sent but never accepted, a declined
        // one and a removed one all grant exactly nothing — "was invited" is not
        // "is a member", and the partial unique index guarantees at most one row
        // can be live here.
        status: TeamMemberStatus.ACTIVE,
      },
      select: { id: true, accessLevel: true },
    });

    if (!membership) {
      return null;
    }

    return {
      businessProfileId: business.id,
      userId,
      isOwner: false,
      accessLevel: membership.accessLevel,
      memberId: membership.id,
    };
  }

  /**
   * Asserts a capability, returning the resolved access for the caller to use.
   *
   * The one entry point every business write should call — it is what makes
   * "access levels enforced server-side" true rather than aspirational.
   */
  async require(
    user: AuthenticatedUser,
    businessProfileId: string,
    capability: BusinessCapability,
  ): Promise<BusinessAccess> {
    const access = await this.resolve(user.id, businessProfileId);

    if (!access) {
      // No relationship at all: indistinguishable from "no such business".
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'BUSINESS_NOT_FOUND',
        'We could not find that business.',
      );
    }

    if (!canPerform(access, capability)) {
      logger.warn('Business capability refused', {
        payload: {
          businessProfileId,
          userId: user.id,
          capability,
          accessLevel: access.accessLevel,
        },
      });
      // A real member asking for something outside their level DOES get a 403:
      // they already know the company exists, and telling them their access is
      // insufficient is the difference between a usable product and a broken one.
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'INSUFFICIENT_BUSINESS_ACCESS',
        'Your access level for this business does not allow that.',
      );
    }

    return access;
  }

  /**
   * The business the caller acts for when the request does not name one — their
   * own company first, otherwise the one team they are an active member of.
   *
   * Deliberately refuses to guess when a caller is an active member of several
   * businesses: silently picking one would post a job, or spend money, against
   * whichever company happened to sort first.
   */
  async resolveDefault(userId: string): Promise<BusinessAccess> {
    const owned = await this.prisma.client.businessProfile.findUnique({
      where: { ownerId: userId },
      select: { id: true },
    });

    if (owned) {
      return {
        businessProfileId: owned.id,
        userId,
        isOwner: true,
        accessLevel: null,
        memberId: null,
      };
    }

    const memberships = await this.prisma.client.businessTeamMember.findMany({
      where: { userId, status: TeamMemberStatus.ACTIVE },
      select: { id: true, businessProfileId: true, accessLevel: true },
      take: 2,
    });

    if (memberships.length === 0) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'NO_BUSINESS',
        'You do not belong to a business yet.',
      );
    }

    const [membership] = memberships;
    if (memberships.length > 1 || !membership) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'AMBIGUOUS_BUSINESS',
        'You belong to more than one business — say which one this is for.',
      );
    }

    return {
      businessProfileId: membership.businessProfileId,
      userId,
      isOwner: false,
      accessLevel: membership.accessLevel,
      memberId: membership.id,
    };
  }

  /** What the caller may do, for the UI to render the right surface (BIZ-03). */
  async capabilities(userId: string, businessProfileId: string): Promise<BusinessCapability[]> {
    const access = await this.resolve(userId, businessProfileId);
    return access ? [...capabilitiesFor(access)] : [];
  }
}
