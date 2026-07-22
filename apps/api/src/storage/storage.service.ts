import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MediaVisibility, type MediaAssetKind } from '@trustpro/database';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { detectMimeTypes } from './file-signature.util';
import {
  getS3Config,
  isKycKind,
  isS3Configured,
  UPLOAD_POLICIES,
  type S3Config,
} from './storage.config';

const logger = createLogger('storage');

export interface StoredObject {
  s3Key: string;
  mimeType: string;
  sizeBytes: number;
  visibility: MediaVisibility;
  /** SHA-256 of the stored bytes, hex. Integrity + duplicate detection (TRU-08). */
  checksum: string;
}

/**
 * Object storage for portfolio media, KYC documents and business papers.
 *
 * Falls back to local disk when S3 is not configured, mirroring the notification
 * module's console provider: a developer without AWS credentials can still run
 * onboarding end to end, and the swap is invisible to every call site.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly config: S3Config = getS3Config();
  private readonly useS3 = isS3Configured(this.config);
  private client?: S3Client;

  /** Where the local driver writes. Never served directly by the API. */
  private readonly localRoot = join(process.cwd(), '.uploads');

  onModuleInit(): void {
    if (!this.useS3) {
      logger.warn('S3 is not configured — uploads fall back to local disk (development only)');
      return;
    }

    this.client = new S3Client({
      region: this.config.region,
      ...(this.config.endpoint
        ? // Custom endpoints (MinIO, R2, Spaces) need path-style addressing;
          // virtual-host style assumes an AWS-shaped DNS name.
          { endpoint: this.config.endpoint, forcePathStyle: true }
        : {}),
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }

  /**
   * Validates and stores one uploaded file.
   *
   * Validation order is deliberate: size first (cheapest, and it bounds the work
   * everything else does), then the declared MIME against the per-kind policy,
   * then the ACTUAL bytes. A file whose content disagrees with its declared type
   * is rejected outright rather than being stored under the sniffed type.
   */
  async store(
    ownerId: string,
    kind: MediaAssetKind,
    file: { buffer: Buffer; mimetype: string; size: number; originalname?: string },
  ): Promise<StoredObject> {
    const policy = UPLOAD_POLICIES[kind];

    if (file.size > policy.maxBytes) {
      throw new AppException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'FILE_TOO_LARGE',
        `That file is too large. The limit is ${Math.floor(policy.maxBytes / (1024 * 1024))}MB.`,
        { file: ['Choose a smaller file, or take the photo at a lower resolution.'] },
      );
    }

    if (file.size === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'FILE_EMPTY',
        'That file appears to be empty.',
        {
          file: ['Choose a file and try again.'],
        },
      );
    }

    // The bytes may legitimately be more than one type: WebM, Ogg and MP4 have
    // the same magic number whether they carry audio or video. So sniffing gives
    // a CANDIDATE SET, and the declared type is allowed to pick among it — never
    // to escape it. A renamed executable still matches nothing and is refused.
    const candidates = detectMimeTypes(file.buffer);
    const detected = candidates.includes(file.mimetype) ? file.mimetype : (candidates[0] ?? null);

    if (!detected || !policy.mimeTypes.includes(detected)) {
      throw new AppException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'UNSUPPORTED_FILE_TYPE',
        'That file type is not supported.',
        { file: [`Upload one of: ${policy.mimeTypes.join(', ')}.`] },
      );
    }

    if (detected !== file.mimetype) {
      // Not necessarily an attack — some browsers mislabel WebP — but it is
      // always worth a log line, and the SNIFFED type is what we store.
      logger.warn('Upload MIME mismatch', {
        payload: { ownerId, kind, declared: file.mimetype, detected },
      });
    }

    // Random key, never the user's filename: filenames carry PII, collide, and
    // are a path-traversal vector the moment anything joins them to a path.
    const s3Key = `${policy.prefix}/${ownerId}/${randomUUID()}${extensionFor(detected)}`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    if (this.useS3 && this.client) {
      // Customer-managed keys for identity documents where one is configured, so
      // access to every ID we hold can be revoked with a single key action
      // (NFR-SEC-04). S3-managed AES256 everywhere else — and for KYC too when
      // no key is set, because unencrypted is never the fallback.
      const useKms = isKycKind(kind) && Boolean(this.config.kmsKeyId);

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: s3Key,
          Body: file.buffer,
          ContentType: detected,
          // Encryption at rest for KYC media is a hard requirement (NFR-SEC).
          // Applied to every object rather than only private ones — there is no
          // benefit to leaving portfolio images unencrypted.
          ...(useKms
            ? { ServerSideEncryption: 'aws:kms' as const, SSEKMSKeyId: this.config.kmsKeyId }
            : { ServerSideEncryption: 'AES256' as const }),
        }),
      );
    } else {
      const target = join(this.localRoot, s3Key);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.buffer);
    }

    logger.info('Object stored', {
      result: { ownerId, kind, sizeBytes: file.size, driver: this.useS3 ? 's3' : 'local' },
    });

    return {
      s3Key,
      mimeType: detected,
      sizeBytes: file.size,
      visibility: policy.visibility,
      checksum,
    };
  }

  /**
   * Removes the bytes behind a key.
   *
   * Callers must have established that nothing still needs them — a document
   * attached to a verification is soft-deleted in the database and keeps its
   * object, because the audit trail behind a granted tier has to outlive the
   * user's tidying up.
   */
  async remove(s3Key: string): Promise<void> {
    if (this.useS3 && this.client) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: s3Key }));
    } else {
      await rm(join(this.localRoot, s3Key), { force: true });
    }

    logger.info('Object removed', { result: { driver: this.useS3 ? 's3' : 'local' } });
  }

  /**
   * A URL the owner (or an authorised reviewer) can open.
   *
   * PRIVATE objects get a short-lived signed URL generated per request — access
   * is decided at read time, so revoking a role takes effect immediately rather
   * than waiting for some previously-issued link to expire.
   */
  async urlFor(s3Key: string, visibility: MediaVisibility): Promise<string | null> {
    if (!this.useS3 || !this.client) {
      // The local driver has no HTTP surface on purpose: dev uploads are
      // verifiable on disk, and inventing one would be a route to secure later.
      return null;
    }

    if (visibility === MediaVisibility.PUBLIC && this.config.publicUrl) {
      return `${this.config.publicUrl.replace(/\/$/, '')}/${s3Key}`;
    }

    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: s3Key }),
      { expiresIn: this.config.signedUrlTtlSeconds },
    );
  }
}

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    case 'audio/webm':
      return '.weba';
    case 'audio/ogg':
      return '.ogg';
    case 'audio/mp4':
      return '.m4a';
    case 'audio/mpeg':
      return '.mp3';
    default:
      return '';
  }
}
