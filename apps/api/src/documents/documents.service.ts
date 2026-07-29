import { HttpStatus, Injectable } from '@nestjs/common';
import {
  VerificationStatus,
  type MediaAsset,
  type VerificationCheckType,
  type VerificationRejectionReason,
} from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { decideDocumentAccess } from './document-access.model';
import type { DocumentView } from './models/document.model';

const logger = createLogger('documents');

/** i18n key prefix for the localized friendly-retry copy (TRU-07). */
const REJECTION_KEY_PREFIX = 'Verification.rejection';

/** The columns every read here needs. Explicit, so no query ever selects `*`. */
const DOCUMENT_SELECT = {
  id: true,
  ownerId: true,
  kind: true,
  mimeType: true,
  sizeBytes: true,
  visibility: true,
  deletedAt: true,
  createdAt: true,
  s3Key: true,
  verifications: {
    // Newest check first: a document re-submitted after a rejection shows the
    // outcome that is currently true, not the one that made the user re-upload.
    orderBy: { verificationRecord: { createdAt: 'desc' } },
    take: 1,
    select: {
      verificationRecord: {
        select: { status: true, checkType: true, rejectionReason: true },
      },
    },
  },
} as const;

type DocumentRow = Pick<
  MediaAsset,
  | 'id'
  | 'ownerId'
  | 'kind'
  | 'mimeType'
  | 'sizeBytes'
  | 'visibility'
  | 'deletedAt'
  | 'createdAt'
  | 's3Key'
> & {
  verifications: {
    verificationRecord: {
      status: VerificationStatus;
      checkType: VerificationCheckType;
      rejectionReason: VerificationRejectionReason | null;
    };
  }[];
};

/**
 * Secure document storage and access (P27; TRU-06 storage, TRU-08, NFR-SEC-04).
 *
 * Every read goes through {@link decideDocumentAccess}, and staff reads of
 * someone else's identity documents are audit-logged. "Authorised" is not the
 * same as "unobserved": an internal actor opening KYC media is exactly the
 * access worth a trail.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** The owner's Documents area (TRU-08). Retired files are excluded. */
  async listOwn(ownerId: string): Promise<DocumentView[]> {
    const rows = await this.prisma.client.mediaAsset.findMany({
      where: { ownerId, deletedAt: null },
      select: DOCUMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      // Bounded: a Documents area is a handful of files, and an unbounded list
      // endpoint is a slow query waiting for the one account that abuses it.
      take: 100,
    });

    return Promise.all(rows.map((row) => this.toView(row as DocumentRow)));
  }

  /**
   * One document, with its signed URL — the read path a reviewer uses.
   *
   * Refusals are deliberately indistinguishable from "no such document": a 404
   * for both means a stranger cannot use this endpoint to learn that a given
   * person has uploaded a national ID.
   */
  async findForViewer(
    documentId: string,
    viewer: AuthenticatedUser | undefined,
  ): Promise<DocumentView> {
    const row = await this.prisma.client.mediaAsset.findUnique({
      where: { id: documentId },
      select: DOCUMENT_SELECT,
    });

    if (!row) {
      throw notFound();
    }

    const decision = decideDocumentAccess(row, viewer);

    if (!decision.allowed) {
      logger.warn('Document access denied', {
        payload: { documentId, viewerId: viewer?.id, reason: decision.reason },
      });
      throw notFound();
    }

    if (decision.auditable) {
      // Staff reading someone else's KYC media (NFR-SEC-05). Written before the
      // URL is minted, so the trail cannot be missing for a link that exists.
      await this.prisma.client.auditLog.create({
        data: {
          actorId: viewer?.id ?? null,
          action: 'document.viewed',
          target: `MediaAsset:${documentId}`,
          requestId: getRequestId(),
          meta: { ownerId: row.ownerId, kind: row.kind, viewerRole: viewer?.activeRole },
        },
      });
    }

    return this.toView(row);
  }

  /**
   * Retires a document (TRU-08 visibility controls).
   *
   * Soft delete when anything has been reviewed against it: the bytes behind a
   * check that granted a tier are the evidence for that tier, and a user tidying
   * up their Documents area must not be able to erase the audit trail. An
   * unreferenced file is genuinely removed, storage and all — keeping an ID
   * nobody ever asked for would be the privacy failure, not the safe option.
   */
  async remove(
    documentId: string,
    owner: AuthenticatedUser,
  ): Promise<{ id: string; purged: boolean }> {
    const row = await this.prisma.client.mediaAsset.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        ownerId: true,
        kind: true,
        s3Key: true,
        deletedAt: true,
        _count: { select: { verifications: true, portfolio: true } },
      },
    });

    if (!row || row.ownerId !== owner.id) {
      throw notFound();
    }

    const referenced = row._count.verifications > 0 || row._count.portfolio > 0;

    if (referenced) {
      await this.prisma.client.mediaAsset.update({
        where: { id: documentId },
        data: { deletedAt: row.deletedAt ?? new Date() },
      });
    } else {
      // Order matters: drop the row first so a failed object delete leaves an
      // orphaned object (sweepable) rather than a row pointing at nothing.
      await this.prisma.client.mediaAsset.delete({ where: { id: documentId } });
      await this.storage.remove(row.s3Key);
    }

    await this.prisma.client.auditLog.create({
      data: {
        actorId: owner.id,
        action: referenced ? 'document.retired' : 'document.purged',
        target: `MediaAsset:${documentId}`,
        requestId: getRequestId(),
        meta: { kind: row.kind },
      },
    });

    logger.info('Document removed', {
      result: { documentId, kind: row.kind, purged: !referenced },
    });

    return { id: documentId, purged: !referenced };
  }

  /** Signed URL + review state. The URL is minted per request, never stored. */
  private async toView(row: DocumentRow): Promise<DocumentView> {
    const latest = row.verifications[0]?.verificationRecord ?? null;

    return {
      id: row.id,
      kind: row.kind,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      visibility: row.visibility,
      url: await this.storage.urlFor(row.s3Key, row.visibility),
      status: latest?.status ?? null,
      checkType: latest?.checkType ?? null,
      rejectionKey:
        latest?.status === VerificationStatus.REJECTED && latest.rejectionReason
          ? `${REJECTION_KEY_PREFIX}.${latest.rejectionReason}`
          : null,
      createdAt: row.createdAt,
    };
  }
}

/**
 * One message for "missing" and for "not yours". Distinguishing them would turn
 * this endpoint into an oracle for whether a given person has uploaded an ID.
 */
function notFound(): AppException {
  return new AppException(
    HttpStatus.NOT_FOUND,
    'DOCUMENT_NOT_FOUND',
    'We could not find that document.',
  );
}
