import { MediaAssetKind, MediaVisibility, Role } from '@kavio/database';
import {
  decideDocumentAccess,
  type DocumentAccessSubject,
  type DocumentAccessViewer,
} from './document-access.model';

const OWNER = 'a0000000-0000-4000-8000-000000000001';
const STRANGER = 'a0000000-0000-4000-8000-000000000002';

function kycDocument(overrides: Partial<DocumentAccessSubject> = {}): DocumentAccessSubject {
  return {
    ownerId: OWNER,
    kind: MediaAssetKind.NATIONAL_ID_FRONT,
    visibility: MediaVisibility.PRIVATE,
    deletedAt: null,
    ...overrides,
  };
}

function viewer(id: string, activeRole: Role): DocumentAccessViewer {
  return { id, activeRole };
}

describe('decideDocumentAccess (NFR-SEC-04)', () => {
  describe('the owner', () => {
    it('may read their own KYC document', () => {
      const decision = decideDocumentAccess(kycDocument(), viewer(OWNER, Role.WORKER));

      expect(decision).toEqual({ allowed: true, reason: 'OWNER', auditable: false });
    });

    it('may still read it after retiring it', () => {
      const decision = decideDocumentAccess(
        kycDocument({ deletedAt: new Date() }),
        viewer(OWNER, Role.WORKER),
      );

      expect(decision.allowed).toBe(true);
    });

    it('keeps access whichever role they are currently acting as', () => {
      for (const role of Object.values(Role)) {
        expect(decideDocumentAccess(kycDocument(), viewer(OWNER, role)).allowed).toBe(true);
      }
    });
  });

  describe('a stranger', () => {
    it('is refused a private document', () => {
      const decision = decideDocumentAccess(kycDocument(), viewer(STRANGER, Role.CLIENT));

      expect(decision).toEqual({ allowed: false, reason: 'NOT_OWNER', auditable: false });
    });

    it.each([Role.WORKER, Role.CLIENT, Role.BUSINESS])('is refused while acting as %s', (role) => {
      expect(decideDocumentAccess(kycDocument(), viewer(STRANGER, role)).allowed).toBe(false);
    });

    it('may read a public asset', () => {
      const portfolio = kycDocument({
        kind: MediaAssetKind.PORTFOLIO_IMAGE,
        visibility: MediaVisibility.PUBLIC,
      });

      expect(decideDocumentAccess(portfolio, viewer(STRANGER, Role.CLIENT))).toEqual({
        allowed: true,
        reason: 'PUBLIC_ASSET',
        auditable: false,
      });
    });
  });

  describe('a guest', () => {
    it('may read a public asset — the guest first-interface depends on it (ACC-01)', () => {
      const portfolio = kycDocument({
        kind: MediaAssetKind.PORTFOLIO_IMAGE,
        visibility: MediaVisibility.PUBLIC,
      });

      expect(decideDocumentAccess(portfolio, undefined).allowed).toBe(true);
    });

    it('is refused every private document', () => {
      expect(decideDocumentAccess(kycDocument(), undefined)).toEqual({
        allowed: false,
        reason: 'ANONYMOUS',
        auditable: false,
      });
    });
  });

  describe('staff', () => {
    it.each([Role.ADMIN, Role.AGENT])('may review a KYC document as %s', (role) => {
      const decision = decideDocumentAccess(kycDocument(), viewer(STRANGER, role));

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('STAFF_REVIEW');
    });

    it('has every such read marked auditable (NFR-SEC-05)', () => {
      const decision = decideDocumentAccess(kycDocument(), viewer(STRANGER, Role.ADMIN));

      expect(decision.auditable).toBe(true);
    });

    it('loses the ability once they switch to a non-staff role', () => {
      // The whole point of scoping on the ACTIVE role: an admin hiring a plumber
      // as a Client should not carry KYC access into that session.
      const decision = decideDocumentAccess(kycDocument(), viewer(STRANGER, Role.CLIENT));

      expect(decision.allowed).toBe(false);
    });

    it('cannot browse a retired document through the documents area', () => {
      const decision = decideDocumentAccess(
        kycDocument({ deletedAt: new Date() }),
        viewer(STRANGER, Role.ADMIN),
      );

      expect(decision).toEqual({ allowed: false, reason: 'DELETED', auditable: false });
    });
  });
});
