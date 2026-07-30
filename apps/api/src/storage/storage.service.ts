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
import { del as vercelBlobDel, head as vercelBlobHead, put as vercelBlobPut } from '@vercel/blob';
import { MediaVisibility, type MediaAssetKind } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { detectMimeTypes } from './file-signature.util';
import {
  getS3Config,
  getSupabaseStorageConfig,
  getVercelBlobConfig,
  isKycKind,
  isS3Configured,
  isSupabaseStorageConfigured,
  isVercelBlobConfigured,
  UPLOAD_POLICIES,
  type S3Config,
  type SupabaseStorageConfig,
  type VercelBlobConfig,
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

/** Which backend actually holds the bytes, decided once at startup. */
type StorageDriver = 's3' | 'vercel-blob' | 'supabase' | 'local';

/**
 * Object storage for portfolio media, KYC documents and business papers.
 *
 * S3 (or an S3-compatible bucket) is the primary, full-featured driver — it is
 * the only one with customer-managed KMS keys for KYC media. When it is not
 * configured, two simpler managed stores are tried in turn (Vercel Blob, then
 * Supabase Storage) before falling all the way back to local disk. That order
 * — three real, network-reachable drivers before the disk — mirrors the
 * notification module's console provider: a developer or a small deployment
 * without AWS credentials still gets a REAL object store with almost no setup,
 * and local disk stays what it always was, a last resort for a laptop with
 * none of the three configured. The swap is invisible to every call site.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly s3Config: S3Config = getS3Config();
  private readonly vercelBlobConfig: VercelBlobConfig = getVercelBlobConfig();
  private readonly supabaseConfig: SupabaseStorageConfig = getSupabaseStorageConfig();

  private readonly driver: StorageDriver = isS3Configured(this.s3Config)
    ? 's3'
    : isVercelBlobConfigured(this.vercelBlobConfig)
      ? 'vercel-blob'
      : isSupabaseStorageConfigured(this.supabaseConfig)
        ? 'supabase'
        : 'local';

  private client?: S3Client;

  /** Where the local driver writes. Never served directly by the API. */
  private readonly localRoot = join(process.cwd(), '.uploads');

  onModuleInit(): void {
    if (this.driver === 'local') {
      logger.warn(
        'No object storage configured (S3, Vercel Blob, Supabase Storage) — ' +
          'uploads fall back to local disk (development only)',
      );
      return;
    }

    if (this.driver !== 's3') {
      logger.info(`Object storage driver: ${this.driver}`);
      return;
    }

    this.client = new S3Client({
      region: this.s3Config.region,
      ...(this.s3Config.endpoint
        ? // Custom endpoints (MinIO, R2, Spaces) need path-style addressing;
          // virtual-host style assumes an AWS-shaped DNS name.
          { endpoint: this.s3Config.endpoint, forcePathStyle: true }
        : {}),
      credentials: {
        accessKeyId: this.s3Config.accessKeyId,
        secretAccessKey: this.s3Config.secretAccessKey,
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

    // What actually gets persisted as `s3Key` in the DB. Same as the generated
    // pathname for every driver except vercel-blob, which is swapped below for
    // the real URL `put()` hands back — see the comment on `urlFor()` for why.
    let storedKey: string = s3Key;

    switch (this.driver) {
      case 's3': {
        // Customer-managed keys for identity documents where one is configured, so
        // access to every ID we hold can be revoked with a single key action
        // (NFR-SEC-04). S3-managed AES256 everywhere else — and for KYC too when
        // no key is set, because unencrypted is never the fallback.
        const useKms = isKycKind(kind) && Boolean(this.s3Config.kmsKeyId);

        await this.client!.send(
          new PutObjectCommand({
            Bucket: this.s3Config.bucket,
            Key: s3Key,
            Body: file.buffer,
            ContentType: detected,
            // Encryption at rest for KYC media is a hard requirement (NFR-SEC).
            // Applied to every object rather than only private ones — there is no
            // benefit to leaving portfolio images unencrypted.
            ...(useKms
              ? { ServerSideEncryption: 'aws:kms' as const, SSEKMSKeyId: this.s3Config.kmsKeyId }
              : { ServerSideEncryption: 'AES256' as const }),
          }),
        );
        break;
      }
      case 'vercel-blob': {
        // `head()`/`del()` on this SDK take the blob's actual URL, not the
        // pathname used to create it — passing the bare pathname is exactly
        // what produced "Vercel Blob: Url is malformed" in production. `put()`
        // is the only call that ever learns the real URL, so it is captured
        // here and persisted as `s3Key` instead of the generated pathname.
        const result = await vercelBlobPut(s3Key, file.buffer, {
          access: policy.visibility === MediaVisibility.PUBLIC ? 'public' : 'private',
          contentType: detected,
          token: this.vercelBlobConfig.token,
          // The key already carries a UUID, so there is nothing to disambiguate
          // and no risk in reusing the exact pathname we generated.
          addRandomSuffix: false,
        });
        storedKey = result.url;
        break;
      }
      case 'supabase':
        await this.supabasePut(s3Key, file.buffer, detected);
        break;
      case 'local': {
        const target = join(this.localRoot, s3Key);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.buffer);
        break;
      }
    }

    logger.info('Object stored', {
      result: { ownerId, kind, sizeBytes: file.size, driver: this.driver },
    });

    return {
      s3Key: storedKey,
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
    switch (this.driver) {
      case 's3':
        await this.client!.send(
          new DeleteObjectCommand({ Bucket: this.s3Config.bucket, Key: s3Key }),
        );
        break;
      case 'vercel-blob':
        await vercelBlobDel(s3Key, { token: this.vercelBlobConfig.token });
        break;
      case 'supabase':
        await this.supabaseDelete(s3Key);
        break;
      case 'local':
        await rm(join(this.localRoot, s3Key), { force: true });
        break;
    }

    logger.info('Object removed', { result: { driver: this.driver } });
  }

  /**
   * A URL the owner (or an authorised reviewer) can open.
   *
   * PRIVATE objects get a short-lived signed URL generated per request — access
   * is decided at read time, so revoking a role takes effect immediately rather
   * than waiting for some previously-issued link to expire.
   */
  async urlFor(s3Key: string, visibility: MediaVisibility): Promise<string | null> {
    // Seed/demo data — and any driver that hands back a real URL at write time
    // (see `store()`'s vercel-blob case below) — stores the fully-qualified
    // URL directly in s3Key rather than a driver-relative key. That is the
    // documented convention in packages/database/prisma/seed.mjs ("if s3Key
    // starts with http, redirect/serve as-is"); this was the one place it was
    // never actually implemented, so every seeded avatar/cover/portfolio/job
    // photo fell through to a driver call that doesn't know what to do with a
    // Pravatar/Picsum URL.
    if (/^https?:\/\//i.test(s3Key)) {
      return s3Key;
    }

    switch (this.driver) {
      case 'local':
        // The local driver has no HTTP surface on purpose: dev uploads are
        // verifiable on disk, and inventing one would be a route to secure later.
        return null;

      case 's3': {
        if (visibility === MediaVisibility.PUBLIC && this.s3Config.publicUrl) {
          return `${this.s3Config.publicUrl.replace(/\/$/, '')}/${s3Key}`;
        }
        return getSignedUrl(
          this.client!,
          new GetObjectCommand({ Bucket: this.s3Config.bucket, Key: s3Key }),
          { expiresIn: this.s3Config.signedUrlTtlSeconds },
        );
      }

      case 'vercel-blob': {
        if (visibility !== MediaVisibility.PUBLIC) {
          // Vercel Blob has no server-mediated, browser-fetchable signed-URL
          // primitive for PRIVATE objects — same "no HTTP surface" limitation
          // as local disk. Storing KYC media on this driver still enforces
          // isolation-by-key; it just cannot hand the browser a temporary link.
          return null;
        }
        // The public URL is deterministic from the pathname + store, but the
        // store id lives inside the token in a form the SDK does not expose —
        // head() is the documented way to resolve it without guessing at the
        // wire format.
        const result = await vercelBlobHead(s3Key, { token: this.vercelBlobConfig.token });
        return result.url;
      }

      case 'supabase':
        return this.supabaseUrlFor(s3Key, visibility);
    }
  }

  private supabaseObjectUrl(s3Key: string): string {
    return `${this.supabaseConfig.url}/storage/v1/object/${this.supabaseConfig.bucket}/${s3Key}`;
  }

  private async supabasePut(s3Key: string, buffer: Buffer, contentType: string): Promise<void> {
    const res = await fetch(this.supabaseObjectUrl(s3Key), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.supabaseConfig.serviceRoleKey}`,
        apikey: this.supabaseConfig.serviceRoleKey,
        'Content-Type': contentType,
      },
      // Buffer's ArrayBufferLike generic does not satisfy BodyInit/BlobPart
      // directly; copying into a plain Uint8Array does.
      body: new Blob([Uint8Array.from(buffer)]),
    });
    if (!res.ok) {
      throw new Error(`Supabase Storage upload failed (${res.status}): ${await res.text()}`);
    }
  }

  private async supabaseDelete(s3Key: string): Promise<void> {
    const res = await fetch(this.supabaseObjectUrl(s3Key), {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.supabaseConfig.serviceRoleKey}`,
        apikey: this.supabaseConfig.serviceRoleKey,
      },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Supabase Storage delete failed (${res.status}): ${await res.text()}`);
    }
  }

  /**
   * PUBLIC objects resolve to Supabase's stable public URL with no round trip.
   * PRIVATE objects need a signed URL minted per request — the bucket itself
   * is never made public, so a leaked object key alone grants nothing.
   */
  private async supabaseUrlFor(s3Key: string, visibility: MediaVisibility): Promise<string | null> {
    if (visibility === MediaVisibility.PUBLIC) {
      return `${this.supabaseConfig.url}/storage/v1/object/public/${this.supabaseConfig.bucket}/${s3Key}`;
    }

    const res = await fetch(
      `${this.supabaseConfig.url}/storage/v1/object/sign/${this.supabaseConfig.bucket}/${s3Key}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.supabaseConfig.serviceRoleKey}`,
          apikey: this.supabaseConfig.serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: this.supabaseConfig.signedUrlTtlSeconds }),
      },
    );

    if (!res.ok) {
      logger.warn('Supabase Storage signing failed', { payload: { status: res.status } });
      return null;
    }

    const { signedURL } = (await res.json()) as { signedURL: string };
    return `${this.supabaseConfig.url}/storage/v1${signedURL}`;
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
