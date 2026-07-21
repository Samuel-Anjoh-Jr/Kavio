import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../lib/app-exception';
import { permissionsForRole } from '../auth/rbac/permissions';
import { resolveActiveRole } from '../auth/session.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { Me } from './models/me.model';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds the identity graph for `me` (ACC-06).
   *
   * One query with an explicit `select` and the roles included — no N+1, and no
   * columns fetched that the type does not expose (passwordHash must never leave
   * the database layer, so it is not selected at all rather than deleted later).
   *
   * The ACTIVE role comes from the TOKEN, not the row: the session's claim is what
   * every RBAC decision was made against this request, so `me` must agree with it.
   * Reading it from the database instead would let a role switch in another tab
   * silently disagree with what this session is actually allowed to do.
   */
  async findMe(current: AuthenticatedUser): Promise<Me> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: current.id },
      select: {
        id: true,
        phone: true,
        email: true,
        name: true,
        avatar: true,
        locale: true,
        status: true,
        tier: true,
        trustScore: true,
        twoFactorEnabled: true,
        phoneVerifiedAt: true,
        emailVerifiedAt: true,
        createdAt: true,
        roles: {
          select: { role: true, isActive: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'We could not find your account.',
      );
    }

    const activeRole = user.roles.some((grant) => grant.role === current.activeRole)
      ? current.activeRole
      : // The claimed role was revoked since the token was issued; fall back to a
        // role they actually hold rather than reporting one they no longer have.
        resolveActiveRole(user.roles);

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      locale: user.locale,
      status: user.status,
      tier: user.tier,
      trustScore: user.trustScore,
      activeRole,
      roles: user.roles.map((grant) => ({
        role: grant.role,
        isActive: grant.role === activeRole,
        grantedAt: grant.createdAt,
      })),
      permissions: permissionsForRole(activeRole),
      twoFactorEnabled: user.twoFactorEnabled,
      phoneVerifiedAt: user.phoneVerifiedAt,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    };
  }
}
