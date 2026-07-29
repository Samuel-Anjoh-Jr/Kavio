import { Role } from '@kavio/database';
import { permissionsForRole, roleHasAllPermissions, roleHasPermission } from './permissions';

describe('RBAC permission catalogue', () => {
  it('lets a Client post a job but not apply to one', () => {
    expect(roleHasPermission(Role.CLIENT, 'job:create')).toBe(true);
    expect(roleHasPermission(Role.CLIENT, 'job:apply')).toBe(false);
  });

  it('lets a Worker apply and quote but not post a job', () => {
    expect(roleHasPermission(Role.WORKER, 'job:apply')).toBe(true);
    expect(roleHasPermission(Role.WORKER, 'quote:create')).toBe(true);
    expect(roleHasPermission(Role.WORKER, 'job:create')).toBe(false);
  });

  it('treats Business as a superset of Client', () => {
    for (const permission of permissionsForRole(Role.CLIENT)) {
      expect(roleHasPermission(Role.BUSINESS, permission)).toBe(true);
    }
    expect(roleHasPermission(Role.BUSINESS, 'business:team_manage')).toBe(true);
  });

  it('keeps admin capabilities out of every non-admin role', () => {
    const adminOnly = ['admin:access', 'admin:trust_adjust', 'admin:payment_manage'] as const;

    for (const role of [Role.CLIENT, Role.WORKER, Role.BUSINESS, Role.AGENT]) {
      for (const permission of adminOnly) {
        expect(roleHasPermission(role, permission)).toBe(false);
      }
    }

    expect(roleHasAllPermissions(Role.ADMIN, adminOnly)).toBe(true);
  });

  it('does not let an Agent trade on the marketplace', () => {
    // Agents onboard and field-verify workers; letting them also quote or get
    // paid would be a conflict of interest, not just a permissions detail.
    expect(roleHasPermission(Role.AGENT, 'verification:field_verify')).toBe(true);
    expect(roleHasPermission(Role.AGENT, 'quote:create')).toBe(false);
    expect(roleHasPermission(Role.AGENT, 'payment:receive')).toBe(false);
    expect(roleHasPermission(Role.AGENT, 'job:create')).toBe(false);
  });

  it('requires EVERY listed permission, not just one', () => {
    expect(roleHasAllPermissions(Role.WORKER, ['job:apply', 'quote:create'])).toBe(true);
    expect(roleHasAllPermissions(Role.WORKER, ['job:apply', 'job:create'])).toBe(false);
  });

  it('grants every role the identity-level basics', () => {
    for (const role of Object.values(Role)) {
      expect(roleHasPermission(role, 'profile:manage')).toBe(true);
      expect(roleHasPermission(role, 'verification:submit')).toBe(true);
    }
  });
});
