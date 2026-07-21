import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { SafetyReadService } from './safety-read.service';
import { EmergencyContactView, SOSAlertView } from './models/safety.model';

/**
 * Safety & SOS READS (GraphQL, per the DUAL API RULE; SOS-02, SOS-03). Writes are
 * on SafetyController. Every query resolves only the caller's own records.
 */
@Resolver()
export class SafetyResolver {
  constructor(private readonly read: SafetyReadService) {}

  @Query(() => [EmergencyContactView], {
    description: "The caller's emergency contacts (SOS-02).",
  })
  async myEmergencyContacts(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergencyContactView[]> {
    return this.read.myContacts(user);
  }

  @Query(() => [SOSAlertView], { description: "The caller's SOS history, newest first (SOS-03)." })
  async mySosAlerts(@CurrentUser() user: AuthenticatedUser): Promise<SOSAlertView[]> {
    return this.read.myAlerts(user);
  }

  @Query(() => SOSAlertView, {
    nullable: true,
    description: "The caller's currently-active alert, if any (SOS-03).",
  })
  async activeSosAlert(@CurrentUser() user: AuthenticatedUser): Promise<SOSAlertView | null> {
    return this.read.activeAlert(user);
  }

  @Query(() => SOSAlertView, {
    nullable: true,
    description: 'One of the caller’s alerts, with its shares and timeline (SOS-03).',
  })
  async sosAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<SOSAlertView | null> {
    return this.read.alert(user, id);
  }
}
