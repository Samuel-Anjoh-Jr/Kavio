import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Role } from '@trustpro/database';
import type { Permission } from '../rbac/permissions';
import type { AuthenticatedUser } from '../auth.types';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';
export const PERMISSIONS_KEY = 'auth:permissions';

/**
 * Opts a route out of authentication. Auth is DENY-BY-DEFAULT (JwtAuthGuard is
 * registered globally), so a new controller is protected the moment it exists and
 * exposing it is a deliberate, greppable act — the safe direction for the mistake
 * to fall in (NFR-SEC-02).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires the ACTIVE role to be one of these. Prefer @RequirePermissions. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Requires the active role to hold every listed permission. This is the default
 * way to protect a write: it states the capability, not the org chart.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Resolves the request out of either an HTTP or a GraphQL execution context.
 * Both transports run the same guards, so both must find the same request object.
 */
export interface RequestLike {
  user?: AuthenticatedUser;
  headers?: Record<string, unknown>;
  [key: string]: unknown;
}

export function getRequestFromContext(context: ExecutionContext): RequestLike {
  if (context.getType<'graphql'>() === 'graphql') {
    // GqlExecutionContext.getContext() is untyped by design (the shape is
    // whatever the `context` factory returns); ours always carries `req`.
    return GqlExecutionContext.create(context).getContext<{ req: RequestLike }>().req;
  }
  return context.switchToHttp().getRequest<RequestLike>();
}

/**
 * Injects the authenticated identity: `@CurrentUser() user: AuthenticatedUser`.
 * Populated by JwtAuthGuard straight from the verified token claims, so reading
 * it costs no database round-trip.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const user = getRequestFromContext(context)?.user;
    return data ? user?.[data] : user;
  },
);
