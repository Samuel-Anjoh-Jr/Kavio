import { describe, expect, it } from 'vitest';
import { shouldNoindex } from './seo';

/**
 * The other half of the guest-first lock (see intent.test.ts): browsing routes
 * must stay indexable — a guest discovering Kavio through search IS the
 * acquisition funnel (CLAUDE.md ACCESS MODEL) — while account-scoped and
 * money-moving routes must not. Regressing either direction is silent (nobody
 * fails a build over a robots meta tag), so it is pinned here explicitly.
 */
describe('shouldNoindex', () => {
  it('keeps the guest-browsable surfaces indexable', () => {
    expect(shouldNoindex('/app/explore')).toBe(false);
    expect(shouldNoindex('/app/workers/123')).toBe(false);
    expect(shouldNoindex('/')).toBe(false);
  });

  it('keeps account-scoped and money-moving routes out of the index', () => {
    expect(shouldNoindex('/app/wallet')).toBe(true);
    expect(shouldNoindex('/app/messages')).toBe(true);
    expect(shouldNoindex('/app/settings')).toBe(true);
    expect(shouldNoindex('/auth/login')).toBe(true);
  });

  it('noindexes a filtered or paginated discovery URL even though the route itself is public', () => {
    expect(shouldNoindex('/app/explore', { filtered: true })).toBe(true);
    expect(shouldNoindex('/app/explore', { page: 2 })).toBe(true);
  });
});
