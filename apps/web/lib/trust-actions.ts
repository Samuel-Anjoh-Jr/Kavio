import type { OnboardingRole } from './onboarding';

/**
 * Where the Trust Score breakdown's "next action" items actually go (TRU-04).
 *
 * Each contribution type is a stable key from the Trust Engine's ledger
 * (mirrors `improve.*` in messages/*.json), not a page of its own — the
 * destination has to be derived from what that action means and, for the
 * identity checks, from which onboarding flow captures it for this role.
 * Returns null for actions with no real destination today (winning repeat
 * business, earning reviews): those are outcomes of doing the work, not a
 * page to visit, and are rendered as plain text rather than a dead link.
 */
export function trustImprovementHref(
  type: string,
  role: OnboardingRole | null,
  subjectId: string,
): string | null {
  switch (type) {
    case 'PHONE_VERIFIED':
      return '/auth/verify';
    // A Business owner's national ID is captured by business onboarding's own
    // identity step; everyone else only has one place that captures it, worker
    // onboarding — which is also the intended path for a Client or Worker
    // raising this pillar (TRU-04's own copy: it "starts filling in once you
    // offer services").
    case 'ID_VERIFIED':
      return role === 'BUSINESS' ? '/app/onboarding/business' : '/app/onboarding/worker';
    // Portfolio photos have no business equivalent — this pillar is earned as
    // a worker, whichever role is currently active.
    case 'PORTFOLIO_ADDED':
      return '/app/onboarding/worker';
    // Requesting a visit is self-service; completing it still is not (AGT-01).
    case 'FIELD_VERIFIED':
      return '/app/verification';
    // Asking someone to endorse you means sharing your own public profile —
    // that only exists once you have started offering services as a worker.
    case 'ENDORSEMENT_RECEIVED':
      return role === 'WORKER' ? `/app/workers/${subjectId}` : '/app/onboarding/worker';
    default:
      return null;
  }
}
