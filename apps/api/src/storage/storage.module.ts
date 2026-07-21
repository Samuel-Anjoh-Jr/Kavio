import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';

/**
 * Object storage (CLAUDE.md STORAGE). Exports StorageService so the onboarding
 * and (later) verification modules can resolve signed URLs without each one
 * re-implementing the access rules.
 */
@Module({
  imports: [PrismaModule],
  controllers: [UploadsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
