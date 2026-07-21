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
};

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
  };
}

export function isS3Configured(config: S3Config): boolean {
  return Boolean(config.bucket && config.accessKeyId && config.secretAccessKey);
}
