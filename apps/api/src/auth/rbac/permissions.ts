import { Role } from '@trustpro/database';

/**
 * The RBAC permission catalogue (ACC-06, NFR-SEC-02).
 *
 * Guards check PERMISSIONS, not role names. Routes therefore say what they need
 * ("post a job") rather than who is allowed today, so granting Business owners a
 * Worker capability later is a change in this table alone — never a sweep through
 * controllers. Role names remain available via @Roles() for the few places where
 * the role genuinely is the rule (e.g. the admin surface).
 *
 * Permissions are scoped to the ACTIVE role, while tier and Trust Score are read
 * from the identity: switching to Client must not require re-verification, but it
 * must not carry Worker abilities across either.
 */
export const PERMISSIONS = [
  // Discovery / profile
  'profile:manage',
  'portfolio:manage',
  'service:manage',
  'availability:manage',
  'worker:contact',
  'favorite:save',

  // Jobs
  'job:create',
  'job:manage_own',
  'job:apply',

  // Quotes
  'quote:create',
  'quote:respond',

  // Money
  'payment:pay',
  'payment:receive',
  'payout:request',
  'dispute:open',

  // Social
  'message:send',
  'review:create',
  'endorsement:give',

  // Business
  'business:manage',
  'business:team_manage',

  // Verification / agents
  'verification:submit',
  'verification:field_verify',
  'agent:onboard_worker',

  // Admin
  'admin:access',
  'admin:user_manage',
  'admin:verification_review',
  'admin:trust_adjust',
  'admin:dispute_resolve',
  'admin:payment_manage',
  'admin:settings_manage',
  'admin:moderate',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Shared by every signed-in identity regardless of the active role. */
const COMMON: Permission[] = ['profile:manage', 'verification:submit', 'favorite:save'];

const CLIENT: Permission[] = [
  ...COMMON,
  'job:create',
  'job:manage_own',
  'quote:respond',
  'worker:contact',
  'payment:pay',
  'dispute:open',
  'message:send',
  'review:create',
  'endorsement:give',
];

const WORKER: Permission[] = [
  ...COMMON,
  'portfolio:manage',
  'service:manage',
  'availability:manage',
  'job:apply',
  'quote:create',
  'payment:receive',
  'payout:request',
  'dispute:open',
  'message:send',
  'review:create',
];

/**
 * A Business owner hires like a Client and additionally runs the company
 * profile and its team — it is a superset, not a parallel universe.
 */
const BUSINESS: Permission[] = [...CLIENT, 'business:manage', 'business:team_manage'];

/** Field agents onboard and physically verify workers; they do not trade. */
const AGENT: Permission[] = [
  ...COMMON,
  'agent:onboard_worker',
  'verification:field_verify',
  'message:send',
];

/** Admin holds the whole catalogue; ADM-* surfaces gate on the specific ones. */
const ADMIN: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  [Role.CLIENT]: new Set(CLIENT),
  [Role.WORKER]: new Set(WORKER),
  [Role.BUSINESS]: new Set(BUSINESS),
  [Role.AGENT]: new Set(AGENT),
  [Role.ADMIN]: new Set(ADMIN),
};

export function permissionsForRole(role: Role): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? new Set<Permission>())];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/** True when the active role satisfies EVERY permission the route demands. */
export function roleHasAllPermissions(role: Role, required: readonly Permission[]): boolean {
  return required.every((permission) => roleHasPermission(role, permission));
}
