import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { TrackingSessionStatus } from '@trustpro/database';

/**
 * Live-tracking READ models (PROMPT 74; SOS-03). GraphQL, per the DUAL API RULE.
 * The live stream itself is WebSocket; these power the session list and the
 * initial render before the socket's first position arrives.
 */

@ObjectType({ description: 'A live (or last-known) position on a tracking session.' })
export class LivePositionView {
  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;

  @Field(() => Float, { nullable: true })
  accuracy!: number | null;

  @Field(() => Float, { nullable: true })
  heading!: number | null;

  @Field(() => Float, { nullable: true })
  speed!: number | null;

  @Field(() => Int, { nullable: true, description: 'Metres to the destination, if one is set.' })
  distanceMeters!: number | null;

  @Field(() => Int, { nullable: true, description: 'Estimated seconds to arrival.' })
  etaSeconds!: number | null;

  @Field(() => Date)
  recordedAt!: Date;
}

@ObjectType({ description: 'A consented live-tracking session around a booking (SOS-03).' })
export class TrackingSessionView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  bookingId!: string;

  @Field(() => ID, { description: 'The tracked worker.' })
  subjectId!: string;

  @Field(() => ID, { description: 'The consented client viewer.' })
  viewerId!: string;

  @Field(() => TrackingSessionStatus)
  status!: TrackingSessionStatus;

  @Field(() => Boolean, { description: 'Whether the worker has revoked consent.' })
  consentRevoked!: boolean;

  @Field(() => Float, { nullable: true })
  destinationLat!: number | null;

  @Field(() => Float, { nullable: true })
  destinationLng!: number | null;

  @Field(() => LivePositionView, {
    nullable: true,
    description: 'The most recent persisted position, if any pings have arrived.',
  })
  latestPosition!: LivePositionView | null;

  @Field(() => Date)
  startedAt!: Date;

  @Field(() => Date, { nullable: true })
  endedAt!: Date | null;
}
