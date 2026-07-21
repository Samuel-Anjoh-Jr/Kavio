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
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_UPLOAD_BYTES } from './storage.config';
import { StorageService } from './storage.service';

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

    const asset = await this.prisma.client.mediaAsset.create({
      data: {
        ownerId: user.id,
        kind: dto.kind,
        s3Key: stored.s3Key,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        visibility: stored.visibility,
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
