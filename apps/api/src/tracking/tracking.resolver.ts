import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { TrackingReadService } from './tracking-read.service';
import { TrackingSessionView } from './models/tracking.model';

/**
 * Live-tracking READS (GraphQL, per the DUAL API RULE; SOS-03). Writes are on
 * TrackingController and the position stream is on the WS gateway. Every query
 * resolves only sessions the caller is the subject or viewer of.
 */
@Resolver()
export class TrackingResolver {
  constructor(private readonly read: TrackingReadService) {}

  @Query(() => [TrackingSessionView], {
    description: "The caller's tracking sessions, as worker or client (SOS-03).",
  })
  async myTrackingSessions(@CurrentUser() user: AuthenticatedUser): Promise<TrackingSessionView[]> {
    return this.read.mySessions(user);
  }

  @Query(() => TrackingSessionView, {
    nullable: true,
    description: 'One tracking session with its last-known position and ETA (SOS-03).',
  })
  async trackingSession(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<TrackingSessionView | null> {
    return this.read.session(user, id);
  }
}
