/**
 * Where a notification takes you when it is clicked (NOT-02, P77/P78).
 *
 * Deep links live HERE and not in the template store, for two reasons. A URL is
 * not copy: duplicating it per locale would mean an EN click and an FR click
 * could drift to different screens. And the push notification, the service-worker
 * click handler and the in-app inbox row must agree on one destination — which
 * they only do if one function decides it.
 *
 * The emitter always wins: a listener that knows the exact record puts a
 * `deepLink` on the event metadata, and that is used verbatim. The per-template
 * map below is the fallback, so a notification is never a dead end even when its
 * emitter passed no ids — it lands on the surface the event is about.
 */

/** Ids a link may be built from, as carried on the event metadata. */
interface LinkMetadata {
  deepLink?: unknown;
  conversationId?: unknown;
  disputeId?: unknown;
  jobId?: unknown;
  bookingId?: unknown;
  quoteId?: unknown;
  alertId?: unknown;
}

/**
 * Surface each template belongs to when no id is supplied. Every key in the
 * template store resolves to something a person can act on.
 */
const TEMPLATE_SURFACE: Record<string, string> = {
  'system.test_notification': '/app/home',
  'account.welcome': '/app/home',
  'auth.otp_code': '/app/home',
  'auth.password_reset': '/app/home',
  'auth.new_device_login': '/app/settings/security',
  'auth.password_changed': '/app/settings/security',
  'auth.two_factor_changed': '/app/settings/security',
  'trust.tier_promoted': '/app/trust',
  'trust.score_milestone': '/app/trust',
  'trust.badge_unlocked': '/app/trust',
  'verification.approved': '/app/verification',
  'verification.rejected': '/app/verification',
  'verification.info_requested': '/app/verification',
  'job.application_received': '/app/jobs',
  'job.invitation_received': '/app/jobs',
  'job.application_status_changed': '/app/jobs',
  'job.matched': '/app/jobs',
  'quote.received': '/app/quotes',
  'quote.accepted': '/app/quotes',
  'quote.declined': '/app/quotes',
  'quote.counter_requested': '/app/quotes',
  'payment.required': '/app/wallet',
  'payment.received': '/app/wallet',
  'payment.failed': '/app/wallet',
  'escrow.released': '/app/wallet',
  'escrow.refunded': '/app/wallet',
  'dispute.opened': '/app/disputes',
  'dispute.resolved': '/app/disputes',
  'message.received': '/app/messages',
  'review.received': '/app/home',
  'safety.sos_triggered': '/app/safety',
  'moderation.action_taken': '/app/settings/notifications',
  'moderation.report_received': '/app/admin/reports',
};

/** Templates whose link points at a specific record when its id is present. */
function fromMetadata(templateKey: string, meta: LinkMetadata): string | null {
  const id = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;

  switch (templateKey) {
    case 'message.received': {
      const conversationId = id(meta.conversationId);
      return conversationId ? `/app/messages/${conversationId}` : null;
    }
    case 'dispute.opened':
    case 'dispute.resolved': {
      const disputeId = id(meta.disputeId);
      return disputeId ? `/app/disputes/${disputeId}` : null;
    }
    case 'job.application_received':
    case 'job.invitation_received':
    case 'job.application_status_changed':
    case 'job.matched': {
      const jobId = id(meta.jobId);
      return jobId ? `/app/jobs/${jobId}` : null;
    }
    default:
      return null;
  }
}

/**
 * Normalises a link to an app-relative path.
 *
 * Anything that is not a same-app path is dropped rather than stored: a link that
 * arrives from a template variable and is written into a row we later navigate to
 * on click is an open-redirect waiting to happen. Absolute URLs on our own origin
 * are reduced to their path; foreign origins return null.
 */
export function normaliseDeepLink(value: unknown, appBaseUrl?: string): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const raw = value.trim();

  if (raw.startsWith('//')) {
    // Protocol-relative — a foreign origin wearing a relative-looking coat.
    return null;
  }

  if (raw.startsWith('/')) {
    return withAppPrefix(raw);
  }

  if (appBaseUrl) {
    try {
      const url = new URL(raw);
      const base = new URL(appBaseUrl);
      if (url.origin === base.origin) {
        return withAppPrefix(`${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Keeps every in-app destination under the app shell. An emitter that wrote
 * `/messages/:id` meant the app's messages screen, not a marketing route.
 */
function withAppPrefix(path: string): string {
  if (path === '/app' || path.startsWith('/app/') || path.startsWith('/app?')) {
    return path;
  }
  return `/app${path}`;
}

/**
 * The destination for one notification. Emitter-supplied `deepLink` first, then
 * an id-built record link, then the template's surface.
 */
export function resolveDeepLink(
  // Widened to `string` rather than TemplateKey: this is called from the delivery
  // processor with a key that came off a queued job, which may name a template
  // that has since been removed. An unknown key resolves to null, not a crash.
  templateKey: string,
  metadata: Record<string, unknown> | undefined,
  appBaseUrl?: string,
): string | null {
  const meta = (metadata ?? {}) as LinkMetadata;

  const explicit = normaliseDeepLink(meta.deepLink, appBaseUrl);
  if (explicit) {
    return explicit;
  }

  const byId = fromMetadata(templateKey, meta);
  if (byId) {
    return byId;
  }

  return TEMPLATE_SURFACE[templateKey] ?? null;
}
