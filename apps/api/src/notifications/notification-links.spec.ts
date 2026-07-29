import { normaliseDeepLink, resolveDeepLink } from './notification-links';

/**
 * Deep links decide where a push click and an inbox row navigate to (NOT-02).
 * Two things are being guarded here: that every notification lands somewhere a
 * person can act, and that a link arriving through template variables cannot
 * become an open redirect once it is stored and later followed.
 */
describe('notification deep links', () => {
  const BASE = 'https://kavio.cm';

  describe('normaliseDeepLink', () => {
    it('keeps an app-relative path as-is', () => {
      expect(normaliseDeepLink('/app/wallet', BASE)).toBe('/app/wallet');
      expect(normaliseDeepLink('/app/disputes/abc?tab=evidence', BASE)).toBe(
        '/app/disputes/abc?tab=evidence',
      );
    });

    it('pulls a bare path under the app shell', () => {
      // An emitter that wrote "/messages/:id" meant the app's messages screen,
      // not a marketing route that does not exist.
      expect(normaliseDeepLink('/messages/abc', BASE)).toBe('/app/messages/abc');
    });

    it('reduces an absolute URL on our own origin to its path', () => {
      expect(normaliseDeepLink(`${BASE}/app/trust`, BASE)).toBe('/app/trust');
    });

    it('refuses a foreign origin rather than storing it', () => {
      expect(normaliseDeepLink('https://evil.example/app/wallet', BASE)).toBeNull();
      // Protocol-relative: a foreign origin wearing a relative-looking coat.
      expect(normaliseDeepLink('//evil.example/app/wallet', BASE)).toBeNull();
      expect(normaliseDeepLink('javascript:alert(1)', BASE)).toBeNull();
    });

    it('refuses empty and non-string input', () => {
      expect(normaliseDeepLink('', BASE)).toBeNull();
      expect(normaliseDeepLink('   ', BASE)).toBeNull();
      expect(normaliseDeepLink(undefined, BASE)).toBeNull();
      expect(normaliseDeepLink(42, BASE)).toBeNull();
    });
  });

  describe('resolveDeepLink', () => {
    it('prefers the emitter’s explicit link — it knows the exact record', () => {
      expect(
        resolveDeepLink('dispute.opened', { deepLink: '/app/admin/disputes/d1', disputeId: 'd1' }),
      ).toBe('/app/admin/disputes/d1');
    });

    it('builds a record link from ids when no explicit link was passed', () => {
      expect(resolveDeepLink('message.received', { conversationId: 'c1' })).toBe(
        '/app/messages/c1',
      );
      expect(resolveDeepLink('dispute.resolved', { disputeId: 'd1' })).toBe('/app/disputes/d1');
      expect(resolveDeepLink('job.application_received', { jobId: 'j1' })).toBe('/app/jobs/j1');
    });

    it('falls back to the template’s surface so nothing is a dead end', () => {
      expect(resolveDeepLink('quote.received', undefined)).toBe('/app/quotes');
      expect(resolveDeepLink('escrow.released', {})).toBe('/app/wallet');
      expect(resolveDeepLink('message.received', {})).toBe('/app/messages');
    });

    it('ignores a foreign explicit link and still resolves a usable destination', () => {
      expect(
        resolveDeepLink('quote.received', { deepLink: 'https://evil.example/steal' }, BASE),
      ).toBe('/app/quotes');
    });

    it('returns null for a template it has no surface for', () => {
      expect(resolveDeepLink('not.a.template', {})).toBeNull();
    });
  });
});
