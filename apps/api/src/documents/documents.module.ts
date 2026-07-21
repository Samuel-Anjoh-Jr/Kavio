import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { DocumentsController } from './documents.controller';
import { DocumentsResolver } from './documents.resolver';
import { DocumentsService } from './documents.service';

/**
 * Secure document storage and access (PROMPT 27; TRU-08, NFR-SEC-04).
 *
 * StorageModule owns the bytes (S3, validation, signing); this module owns WHO
 * MAY SEE THEM. Splitting it that way is what lets the verification module ask
 * one question — "may this reviewer open this file?" — without also inheriting
 * an S3 client.
 */
@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsResolver],
  exports: [DocumentsService],
})
export class DocumentsModule {}
