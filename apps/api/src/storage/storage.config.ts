import { MediaAssetKind, MediaVisibility } from '@trustpro/database';

/**
 * Upload policy (CLAUDE.md STORAGE, NFR-SEC).
 *
 * Limits and accepted types are declared PER KIND rather than globally: a
 * portfolio photo and a national ID are different risks with different
 * audiences, and one permissive rule covering both is how private KYC media
 * ends up publicly readable.
 */

export interface UploadPolicy {
  /** Accepted MIME types. Checked against sniffed content, not the filename. */
  mimeTypes: readonly string[];
  maxBytes: number;
  /** Who may read it once stored. KYC is always PRIVATE. */
  visibility: MediaVisibility;
  /** Prefix in the bucket, so a lifecycle rule can target KYC separately. */
  prefix: string;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'] as const;

/** Phone cameras in Cameroon routinely produce 4-8MB JPEGs; 10MB is headroom. */
const MB = 1024 * 1024;

export const UPLOAD_POLICIES: Readonly<Record<MediaAssetKind, UploadPolicy>> = {
  [MediaAssetKind.PORTFOLIO_IMAGE]: {
    mimeTypes: IMAGE_TYPES,
    maxBytes: 10 * MB,
    visibility: MediaVisibility.PUBLIC,
    prefix: 'portfolio',
  },
  [MediaAssetKind.NATIONAL_ID_FRONT]: {
    mimeTypes: DOCUMENT_TYPES,
    maxBytes: 10 * MB,
    visibility: MediaVisibility.PRIVATE,
    prefix: 'kyc',
  },
  [MediaAssetKind.NATIONAL_ID_BACK]: {
    mimeTypes: DOCUMENT_TYPES,
    maxBytes: 10 * MB,
    visibility: MediaVisibility.PRIVATE,
    prefix: 'kyc',
  },
  [MediaAssetKind.SELFIE]: {
    mimeTypes: IMAGE_TYPES,
    maxBytes: 10 * MB,
    visibility: MediaVisibility.PRIVATE,
    prefix: 'kyc',
  },
  [MediaAssetKind.PROOF_OF_ADDRESS]: {
    mimeTypes: DOCUMENT_TYPES,
    maxBytes: 10 * MB,
    visibility: MediaVisibility.PRIVATE,
    prefix: 'kyc',
  },
  [MediaAssetKind.CERTIFICATE]: {
    // A trade certificate is evidence a worker chooses to show, but it carries
    // their full legal name and an issuing body — PRIVATE until a check has
    // looked at it, and surfaced on the profile as a verified claim rather than
    // as the scan itself.
    mimeTypes: DOCUMENT_TYPES,
    maxBytes: 10 * MB,
    visibility: MediaVisibility.PRIVATE,
    prefix: 'kyc',
  },
  [MediaAssetKind.BUSINESS_REGISTRATION]: {
    mimeTypes: DOCUMENT_TYPES,
    maxBytes: 15 * MB,
    visibility: MediaVisibility.PRIVATE,
    prefix: 'business',
  },
  [MediaAssetKind.BUSINESS_LOGO]: {
    mimeTypes: IMAGE_TYPES,
    maxBytes: 5 * MB,
    visibility: MediaVisibility.PUBLIC,
    prefix: 'business',
  },
  [MediaAssetKind.WORKER_COVER]: {
    // Its own kind rather than reusing PORTFOLIO_IMAGE: the Trust Engine scores
    // portfolio uploads as evidence of work performed, and a decorative banner
    // must not earn trust points.
    mimeTypes: IMAGE_TYPES,
    maxBytes: 8 * MB,
    visibility: MediaVisibility.PUBLIC,
    prefix: 'portfolio',
  },
};

/**
 * Kinds that are identity documents (NFR-SEC-04).
 *
 * Being on this list is what earns a file the stricter treatment: KMS envelope
 * encryption where configured, staff access that is audit-logged on every view,
 * and a refusal to hard-delete while a verification still points at it. Derived
 * from the upload prefix rather than restated, so adding a KYC kind above cannot
 * forget to add it here.
 */
export const KYC_PREFIX = 'kyc';

export function isKycKind(kind: MediaAssetKind): boolean {
  return UPLOAD_POLICIES[kind].prefix === KYC_PREFIX;
}

/** Largest limit across all kinds — the ceiling multer enforces before buffering. */
export const MAX_UPLOAD_BYTES = Math.max(
  ...Object.values(UPLOAD_POLICIES).map((policy) => policy.maxBytes),
);

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Base URL for PUBLIC objects (CDN or bucket website endpoint). */
  publicUrl?: string;
  /** How long a signed URL for PRIVATE media stays valid. */
  signedUrlTtlSeconds: number;
  /**
   * Optional KMS key for KYC objects (NFR-SEC-04). When set, identity documents
   * are encrypted with a customer-managed key instead of S3-managed AES256 —
   * which is what makes "revoke access to every ID we hold" a single key action
   * rather than an object-by-object sweep. Everything still works without it.
   */
  kmsKeyId?: string;
}

export function getS3Config(): S3Config {
  return {
    bucket: process.env.S3_BUCKET ?? '',
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    publicUrl: process.env.S3_PUBLIC_URL || undefined,
    // Short by design: a leaked KYC link should stop working in minutes, not days.
    signedUrlTtlSeconds: Number(process.env.S3_SIGNED_URL_TTL_SECONDS ?? 300),
    kmsKeyId: process.env.S3_KYC_KMS_KEY_ID || undefined,
  };
}

export function isS3Configured(config: S3Config): boolean {
  return Boolean(config.bucket && config.accessKeyId && config.secretAccessKey);
}
