import { describe, expect, it } from 'vitest';
import { GATED_ACTIONS, safeReturnTo } from './intent';

/**
 * Locks in the guest-first access model (CLAUDE.md ACCESS MODEL; ACC-01/ACC-02):
 * a guest may browse, search and open a full profile with no account, and ONLY
 * the state-changing actions below may bounce them to login. `GATED_ACTIONS` is
 * the single list every gate (`useRequireAuth`, `GatedAction`) reads from, so a
 * browsing action accidentally added here would silently start gating a read —
 * exactly the regression this test exists to catch.
 */
describe('GATED_ACTIONS', () => {
  it('gates exactly the state-changing actions CLAUDE.md names, nothing more', () => {
    expect([...GATED_ACTIONS].sort()).toEqual(
      [
        'post_job',
        'apply_job',
        'contact_worker',
        'request_quote',
        'pay',
        'save_favorite',
        'submit_review',
        'report_content',
        'give_endorsement',
      ].sort(),
    );
  });

  it('never gates browsing — the guest-first surfaces stay off this list', () => {
    const browsingActions = [
      'search',
      'browse',
      'view_profile',
      'view_job',
      'explore',
      'view_worker',
    ];
    for (const action of browsingActions) {
      expect(GATED_ACTIONS as readonly string[]).not.toContain(action);
    }
  });
});

describe('safeReturnTo', () => {
  it('accepts an in-app path', () => {
    expect(safeReturnTo('/app/explore', '/app/home')).toBe('/app/explore');
  });

  it('falls back for a missing value', () => {
    expect(safeReturnTo(null, '/app/home')).toBe('/app/home');
    expect(safeReturnTo(undefined, '/app/home')).toBe('/app/home');
  });

  it('rejects an absolute URL — an open-redirect through the auth bounce', () => {
    expect(safeReturnTo('https://evil.example/phish', '/app/home')).toBe('/app/home');
  });

  it('rejects a protocol-relative URL, which browsers treat as absolute', () => {
    expect(safeReturnTo('//evil.example/phish', '/app/home')).toBe('/app/home');
  });
});
