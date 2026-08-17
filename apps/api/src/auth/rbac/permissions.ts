import { Role } from '@kavio/database';

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

  // Sponsored ranking ("Featured/Verified Business" tier)
  'featured:request',

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
  // A colleague is a valid EndorsementRelationship — without this a worker
  // could never actually give the endorsement the schema already allows for.
  'endorsement:give',
  'featured:request',
];

/**
 * A Business owner hires like a Client and additionally runs the company
 * profile and its team — it is a superset, not a parallel universe.
 *
 * Note that `job:create` sits on BOTH roles, and deliberately so. A Job is the
 * container an engagement lives in — a Quote cannot exist without one — so a
 * client hiring a single worker they picked still creates a job. What separates
 * the two is not creating a job but ADVERTISING one: publishing at PUBLIC
 * visibility puts a vacancy on the open board, and that is gated on a verified
 * business inside JobPostingGateService, not here. Encoding it as a permission
 * would be wrong twice over — the answer depends on live verification state
 * rather than on the role, and it would take direct hiring away from clients.
 */
const BUSINESS: Permission[] = [
  ...CLIENT,
  'business:manage',
  'business:team_manage',
  'featured:request',
];

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
