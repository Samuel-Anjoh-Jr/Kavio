import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModerationController } from './moderation.controller';
import { ModerationReadService } from './moderation-read.service';
import { ModerationResolver } from './moderation.resolver';
import { ModerationService } from './moderation.service';
import { ModerationTargetService } from './moderation-target.service';

/**
 * Reporting & moderation (ADM-08) — one NestJS module per SRS module.
 *
 * Deliberately its own module rather than a corner of `admin` or `messaging`:
 * reporting spans every surface (profiles, jobs, portfolio media, quotes,
 * messages), so it cannot belong to any one of them, and the workflow it owns —
 * report → group → decide → act on the party — is the same whatever was reported.
 *
 * ModerationTargetService is exported because it is the only component that knows
 * how to resolve a (targetType, targetId) pair to an owner and a preview; other
 * modules that grow their own reporting entry points should reuse it rather than
 * re-deriving ownership, which is the rule that keeps a reporter from being able
 * to choose who gets suspended.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ModerationController],
  providers: [
    ModerationService,
    ModerationReadService,
    ModerationTargetService,
    ModerationResolver,
  ],
  exports: [ModerationTargetService],
})
export class ModerationModule {}
