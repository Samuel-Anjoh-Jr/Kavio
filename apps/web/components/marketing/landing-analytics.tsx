'use client';

import { useEffect } from 'react';
import { trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';

/**
 * Fires the top-of-funnel `landing_view` event (SRS §26.6).
 *
 * A one-effect client island rather than logic in the page, so the landing page
 * itself stays a server component — putting `'use client'` on the page to fire
 * one event would opt the whole tree, and its LCP-critical hero, out of static
 * rendering (NFR-PERF-01). The empty-dep effect fires once per mount, which is
 * exactly one funnel entry per visit.
 */
export function LandingAnalytics() {
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.LANDING_VIEW);
  }, []);

  return null;
}
