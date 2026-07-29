import { MediaVisibility, Role, type MediaAssetKind } from '@kavio/database';

/**
 * Who may read a stored document (TRU-08, NFR-SEC-04), as a PURE function.
 *
 * NFR-SEC-04 is one sentence — "identity documents, selfies and KYC media shall
 * be access-controlled, encrypted at rest, and visible only to the owner and
 * authorised agents/admins" — and it is the kind of sentence that gets
 * re-interpreted slightly differently at each call site until one of them is
 * wrong. So the whole rule lives here, returns a REASON rather than a boolean,
 * and is unit-tested against every combination. Services ask; they never decide.
 */

export type DocumentAccessReason =
  'OWNER' | 'PUBLIC_ASSET' | 'STAFF_REVIEW' | 'NOT_OWNER' | 'ANONYMOUS' | 'DELETED';

export interface DocumentAccessDecision {
  readonly allowed: boolean;
  readonly reason: DocumentAccessReason;
  /**
   * True when a staff member is reading someone else's identity document. Every
   * such read is audit-logged: "authorised" is not the same as "unobserved", and
   * an internal actor browsing KYC media is precisely the access worth a trail
   * (NFR-SEC-05).
   */
  readonly auditable: boolean;
}

/** The subject of an access decision. Deliberately not the Prisma row. */
export interface DocumentAccessSubject {
  readonly ownerId: string;
  readonly kind: MediaAssetKind;
  readonly visibility: MediaVisibility;
  readonly deletedAt: Date | null;
}

/** The identity asking. `undefined` is a guest. */
export interface DocumentAccessViewer {
  readonly id: string;
  readonly activeRole: Role;
}

/**
 * Roles that may open another identity's private documents.
 *
 * Scoped to the ACTIVE role, not the granted set: an admin who has switched to
 * their Client role to hire a plumber is browsing as a client, and should not be
 * carrying the ability to open strangers' national IDs while they do it.
 */
const REVIEW_ROLES: readonly Role[] = [Role.ADMIN, Role.AGENT];

export function decideDocumentAccess(
  document: DocumentAccessSubject,
  viewer: DocumentAccessViewer | undefined,
): DocumentAccessDecision {
  // The owner keeps access to their own file even after retiring it — they may
  // well be retiring it because they want to check what they uploaded.
  if (viewer && viewer.id === document.ownerId) {
    return { allowed: true, reason: 'OWNER', auditable: false };
  }

  if (document.deletedAt !== null) {
    // Retired documents leave circulation for everyone but the owner. Staff can
    // still reach one through the verification it backs, which is a different,
    // audited path — a deleted file is not evidence anyone browses casually.
    return { allowed: false, reason: 'DELETED', auditable: false };
  }

  if (document.visibility === MediaVisibility.PUBLIC) {
    // Portfolio photos and business logos. The guest first-interface depends on
    // these being readable with no account at all (ACC-01).
    return { allowed: true, reason: 'PUBLIC_ASSET', auditable: false };
  }

  if (!viewer) {
    return { allowed: false, reason: 'ANONYMOUS', auditable: false };
  }

  if (REVIEW_ROLES.includes(viewer.activeRole)) {
    return { allowed: true, reason: 'STAFF_REVIEW', auditable: true };
  }

  return { allowed: false, reason: 'NOT_OWNER', auditable: false };
}
