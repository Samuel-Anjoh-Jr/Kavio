import { describe, expect, it } from 'vitest';
import { hubGroupOf, trustNudges } from './notification-hub';

describe('hubGroupOf', () => {
  it('puts security, account, dispute and safety notices in Warnings', () => {
    for (const category of ['SECURITY', 'ACCOUNT', 'DISPUTES', 'SAFETY'] as const) {
      expect(hubGroupOf({ category, templateKey: 'anything' })).toBe('WARNINGS');
    }
  });

  it('treats failed, rejected, suspended and expired events as Warnings', () => {
    expect(hubGroupOf({ category: 'PAYMENTS', templateKey: 'payment.failed' })).toBe('WARNINGS');
    expect(hubGroupOf({ category: 'JOBS', templateKey: 'quote.rejected' })).toBe('WARNINGS');
    expect(hubGroupOf({ category: 'TRUST', templateKey: 'verification.expired' })).toBe('WARNINGS');
  });

  it('groups marketing and admin announcements as Announcements', () => {
    expect(hubGroupOf({ category: 'MARKETING', templateKey: 'promo.weekend' })).toBe(
      'ANNOUNCEMENTS',
    );
    expect(hubGroupOf({ category: 'MESSAGES', templateKey: 'admin.announcement.new' })).toBe(
      'ANNOUNCEMENTS',
    );
  });

  it('groups support, report and moderation messages as Support', () => {
    expect(hubGroupOf({ category: 'MESSAGES', templateKey: 'support.reply' })).toBe('SUPPORT');
    expect(hubGroupOf({ category: 'MESSAGES', templateKey: 'report.resolved' })).toBe('SUPPORT');
    expect(hubGroupOf({ category: 'MESSAGES', templateKey: 'moderation.decision' })).toBe(
      'SUPPORT',
    );
  });

  it('defaults everything else to Activity', () => {
    expect(hubGroupOf({ category: 'JOBS', templateKey: 'job.invitation_received' })).toBe(
      'ACTIVITY',
    );
  });
});

describe('trustNudges', () => {
  it('is empty when signed out', () => {
    expect(trustNudges(null, false)).toEqual([]);
    expect(trustNudges(undefined, true)).toEqual([]);
  });

  it('marks each step done from the identity and trusted contact', () => {
    const steps = trustNudges({ phone: '+237677000000', avatar: null, tier: 'TIER_2' }, false);
    expect(Object.fromEntries(steps.map((s) => [s.id, s.done]))).toEqual({
      phone: true,
      photo: false,
      identity: true,
      contact: false,
    });
  });

  it('needs Tier 2 or above for identity, and treats unknown tiers as Tier 0', () => {
    const tier1 = trustNudges({ phone: null, avatar: 'a.jpg', tier: 'TIER_1' }, true);
    expect(tier1.find((s) => s.id === 'identity')?.done).toBe(false);
    const unknown = trustNudges({ phone: null, avatar: null, tier: 'WHATEVER' }, true);
    expect(unknown.find((s) => s.id === 'identity')?.done).toBe(false);
    expect(unknown.find((s) => s.id === 'contact')?.done).toBe(true);
  });
});
