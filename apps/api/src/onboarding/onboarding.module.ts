import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { VerificationModule } from '../verification/verification.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingResolver } from './onboarding.resolver';
import { OnboardingService } from './onboarding.service';

/**
 * Role-specific onboarding (ACC-10, TRU-05, BIZ-04 intake). Writes are REST on
 * OnboardingController; the read is the `onboarding` GraphQL query.
 */
@Module({
  imports: [PrismaModule, StorageModule, VerificationModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingResolver],
  exports: [OnboardingService],
})
export class OnboardingModule {}
