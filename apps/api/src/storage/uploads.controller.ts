import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { MediaAssetKind } from '@trustpro/database';
import { z } from 'zod';
import { Body } from '@nestjs/common';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { isKycKind, MAX_UPLOAD_BYTES } from './storage.config';
import { StorageService } from './storage.service';

const logger = createLogger('uploads');

/** Multer's file shape, declared locally to avoid depending on @types/multer. */
interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

const uploadSchema = z.object({
  kind: z.enum(MediaAssetKind, { message: 'Choose what this file is.' }),
});

type UploadDto = z.infer<typeof uploadSchema>;

/**
 * Media uploads (REST multipart, per the DUAL API RULE — uploads are writes).
 *
 * Authenticated by default: the globally-registered JwtAuthGuard applies because
 * nothing here carries @Public(), and every stored object is owned by the
 * uploader. Ownership is taken from the TOKEN, never from the request body —
 * accepting an ownerId parameter would let anyone write files into someone
 * else's KYC folder.
 */
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  // Uploads are far more expensive than a normal write, so they get their own
  // tighter budget rather than the global default.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseInterceptors(
    FileInterceptor('file', {
      // Multer buffers in memory; the limit stops a huge body being read at all,
      // before StorageService's per-kind policy applies the finer rule.
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(uploadSchema)) dto: UploadDto,
    @UploadedFile() file?: UploadedFileLike,
  ) {
    if (!file) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'FILE_REQUIRED', 'Choose a file to upload.', {
        file: ['No file was received.'],
      });
    }

    const stored = await this.storage.store(user.id, dto.kind, file);

    if (isKycKind(dto.kind)) {
      // The same identity document uploaded under a second account is the
      // cheapest fraud signal there is. It is NOT grounds to reject the upload —
      // families share addresses, and a false accusation at upload time would be
      // a terrible first experience — so it is flagged for a reviewer instead.
      const duplicate = await this.prisma.client.mediaAsset.findFirst({
        where: { checksum: stored.checksum, ownerId: { not: user.id } },
        select: { ownerId: true },
      });

      if (duplicate) {
        logger.warn('Duplicate KYC document uploaded across accounts', {
          payload: { kind: dto.kind, ownerId: user.id, matchedOwnerId: duplicate.ownerId },
        });

        await this.prisma.client.auditLog.create({
          data: {
            actorId: user.id,
            action: 'document.duplicate_detected',
            target: `User:${user.id}`,
            requestId: getRequestId(),
            meta: { kind: dto.kind, matchedOwnerId: duplicate.ownerId },
          },
        });
      }
    }

    const asset = await this.prisma.client.mediaAsset.create({
      data: {
        ownerId: user.id,
        kind: dto.kind,
        s3Key: stored.s3Key,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        visibility: stored.visibility,
        checksum: stored.checksum,
      },
      select: {
        id: true,
        kind: true,
        mimeType: true,
        sizeBytes: true,
        visibility: true,
        s3Key: true,
      },
    });

    return {
      id: asset.id,
      kind: asset.kind,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      url: await this.storage.urlFor(asset.s3Key, asset.visibility),
    };
  }
}
