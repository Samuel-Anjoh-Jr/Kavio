import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@kavio/database';
import { AppException } from '../../lib/app-exception';
import { createLogger } from '../../lib/logger';
import {
  getRequestFromContext,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
} from '../decorators/auth.decorators';
import { roleHasAllPermissions, type Permission } from '../rbac/permissions';

const logger = createLogger('auth:rbac');

/**
 * Authorisation guard (NFR-SEC-02). Runs after JwtAuthGuard and decides purely
 * from the ACTIVE role claim — never from anything the client sent in a body or
 * query, which is the whole point: the client is never trusted for authorisation.
 *
 * Registered globally, but it only acts on routes that actually declare a
 * requirement, so an authenticated-but-unrestricted route stays open to any role.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const hasRoleRule = Boolean(requiredRoles?.length);
    const hasPermissionRule = Boolean(requiredPermissions?.length);
    if (!hasRoleRule && !hasPermissionRule) {
      return true;
    }

    const user = getRequestFromContext(context)?.user;
    if (!user) {
      // JwtAuthGuard should have thrown already; failing closed here means a
      // guard-ordering mistake can never silently authorise a request.
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Sign in to continue.');
    }

    const roleAllowed = !hasRoleRule || requiredRoles.includes(user.activeRole);
    const permissionAllowed =
      !hasPermissionRule || roleHasAllPermissions(user.activeRole, requiredPermissions);

    if (roleAllowed && permissionAllowed) {
      return true;
    }

    // Denials are logged: repeated ones are a real signal (a broken client, or
    // someone probing). The requestId comes from the logger's async context.
    logger.warn('RBAC denied', {
      payload: {
        userId: user.id,
        activeRole: user.activeRole,
        requiredRoles,
        requiredPermissions,
      },
    });

    // The message names the active role because the fix is usually "switch role",
    // and the Role Switcher (ACC-07) makes that a one-tap action.
    throw new AppException(
      HttpStatus.FORBIDDEN,
      'FORBIDDEN_FOR_ROLE',
      `Your ${user.activeRole.toLowerCase()} role cannot do that. Switch role and try again.`,
    );
  }
}
