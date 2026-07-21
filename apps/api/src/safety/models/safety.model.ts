import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { SOSStatus } from '@trustpro/database';

/**
 * Safety & SOS READ models (SOS-02, SOS-03). GraphQL, per the DUAL API RULE —
 * every write is on SafetyController.
 */

@ObjectType({ description: 'A nominated emergency contact (SOS-02).' })
export class EmergencyContactView {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  phone!: string;

  @Field(() => String, { nullable: true })
  relationship!: string | null;

  @Field(() => String, { nullable: true })
  email!: string | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({ description: 'Proof an alert was shared with someone (SOS-01).' })
export class SOSAlertShareView {
  @Field(() => ID)
  id!: string;

  @Field(() => String, {
    nullable: true,
    description: "The contact's name, or null for the internal safety process.",
  })
  contactName!: string | null;

  @Field(() => String, { description: 'How it was sent (email/console/sms/safety_process).' })
  channel!: string;

  @Field(() => Boolean)
  delivered!: boolean;

  @Field(() => Date, { nullable: true })
  sentAt!: Date | null;
}

@ObjectType({ description: 'A move an alert made through its states (SOS-03).' })
export class SOSAlertEventView {
  @Field(() => SOSStatus, { nullable: true })
  fromStatus!: SOSStatus | null;

  @Field(() => SOSStatus)
  toStatus!: SOSStatus;

  @Field(() => String, { nullable: true })
  note!: string | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({ description: 'A triggered safety alert (SOS-01, SOS-03).' })
export class SOSAlertView {
  @Field(() => ID)
  id!: string;

  @Field(() => SOSStatus)
  status!: SOSStatus;

  @Field(() => Float, { nullable: true })
  latitude!: number | null;

  @Field(() => Float, { nullable: true })
  longitude!: number | null;

  @Field(() => String, { nullable: true })
  message!: string | null;

  @Field(() => ID, { nullable: true })
  jobId!: string | null;

  @Field(() => ID, { nullable: true })
  bookingId!: string | null;

  @Field(() => Date, { nullable: true })
  resolvedAt!: Date | null;

  @Field(() => String, { nullable: true })
  resolutionNote!: string | null;

  @Field(() => [SOSAlertShareView], { description: 'Who the alert reached (SOS-01).' })
  shares!: SOSAlertShareView[];

  @Field(() => [SOSAlertEventView], { description: 'The alert timeline (SOS-03).' })
  timeline!: SOSAlertEventView[];

  @Field(() => Date)
  createdAt!: Date;
}
