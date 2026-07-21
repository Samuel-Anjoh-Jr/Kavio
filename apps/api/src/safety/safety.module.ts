import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SafetyController } from './safety.controller';
import { SafetyReadService } from './safety-read.service';
import { SafetyResolver } from './safety.resolver';
import { SafetyService } from './safety.service';

/**
 * Safety & SOS (PROMPT 73; SOS-01, SOS-02, SOS-03).
 *
 * Writes are REST (SafetyController), reads are GraphQL (SafetyResolver) — the
 * DUAL API RULE. Sharing an alert goes through the NotificationDispatcher by
 * emitting a domain event (the mandatory integration pattern), so email/console
 * now and SMS on the flag flip need no change here.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SafetyController],
  providers: [SafetyService, SafetyReadService, SafetyResolver],
  exports: [SafetyService],
})
export class SafetyModule {}
