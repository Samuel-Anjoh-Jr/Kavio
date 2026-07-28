import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformSettingsService } from './platform-settings.service';

/**
 * Admin-tunable settings, read at runtime (ADM-07).
 *
 * Global because the settings it serves are cross-cutting by definition — the
 * contact-verification channel is asked for by auth, by profiles and by search;
 * the posting fee by jobs and by payments. Threading an import through every
 * one of those modules would be ceremony around a single cached read.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class SettingsModule {}
