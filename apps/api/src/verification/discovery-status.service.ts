import { Injectable } from '@nestjs/common';
import { VerificationCheckType, VerificationStatus } from '@trustpro/database';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import {
  ContactChannelRequirementEnum,
  type MyDiscoveryStatusView,
} from './models/discovery-status.model';

/**
 * Answers "is my worker profile visible yet, and if not, what is missing?"
 * (TRU-05).
 *
 * The two halves are deliberately independent facts rather than a single
 * "verified" boolean: the dashboard banner walks the worker through them one at
 * a time, and a merged flag could not say which step to show. They mirror
 * exactly what `search.searchable_worker` filters on — if these two ever
 * disagreed with that view, the banner would tell a worker they are visible
 * while search quietly disagreed.
 */
@Injectable()
export class DiscoveryStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async forUser(userId: string): Promise<MyDiscoveryStatusView> {
    const [user, idRecord, requiredChannel] = await Promise.all([
      this.prisma.client.user.findUnique({
        where: { id: userId },
        select: { phone: true, email: true, phoneVerifiedAt: true, emailVerifiedAt: true },
      }),
      this.prisma.client.verificationRecord.findFirst({
        where: {
          subjectId: userId,
          checkType: VerificationCheckType.ID_APPROVED,
          status: VerificationStatus.VERIFIED,
        },
        select: { id: true },
      }),
      this.settings.contactChannel(),
    ]);

    const phoneVerified = Boolean(user?.phoneVerifiedAt);
    const emailVerified = Boolean(user?.emailVerifiedAt);

    // EITHER is satisfied by whichever the worker actually completed; the named
    // channels are satisfied only by themselves, because an operator who set
    // PHONE meant a phone.
    const contactVerified =
      requiredChannel === 'PHONE'
        ? phoneVerified
        : requiredChannel === 'EMAIL'
          ? emailVerified
          : phoneVerified || emailVerified;

    const idVerified = Boolean(idRecord);

    // Where the code should go. Under EITHER we prefer whichever contact is on
    // file, email first — it is the channel that delivers today, since SMS is a
    // paid aggregator that is not connected.
    const destination =
      requiredChannel === 'PHONE'
        ? (user?.phone ?? null)
        : requiredChannel === 'EMAIL'
          ? (user?.email ?? null)
          : (user?.email ?? user?.phone ?? null);

    const otpChannel = destination ? (destination === user?.email ? 'EMAIL' : 'PHONE') : null;

    return {
      requiredChannel: requiredChannel as ContactChannelRequirementEnum,
      phoneVerified,
      emailVerified,
      contactVerified,
      idVerified,
      discoverable: contactVerified && idVerified,
      otpDestination: destination,
      otpChannel,
    };
  }
}
