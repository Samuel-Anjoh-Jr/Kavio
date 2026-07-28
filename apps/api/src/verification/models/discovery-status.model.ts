import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';

/**
 * Which contact an operator currently requires a worker to verify (ADM-07,
 * `verification.contactChannel`). EITHER means one of the two suffices.
 */
export enum ContactChannelRequirementEnum {
  PHONE = 'PHONE',
  EMAIL = 'EMAIL',
  EITHER = 'EITHER',
}

registerEnumType(ContactChannelRequirementEnum, {
  name: 'ContactChannelRequirement',
  description:
    'Which contact a worker must verify before their profile is public. Admin-configurable; EMAIL while SMS is deferred.',
});

/**
 * Everything the worker's own dashboard needs to explain why their profile is
 * not yet visible, and what to do about it (TRU-05).
 *
 * One query rather than several because the banner is a single decision — show
 * it or not, and if so at which step — and assembling that decision from three
 * separate reads on the client would let the steps disagree with each other
 * mid-render.
 */
@ObjectType({ description: "Why the signed-in worker's profile is or is not discoverable." })
export class MyDiscoveryStatusView {
  @Field(() => ContactChannelRequirementEnum, {
    description: 'What the operator requires right now. Drives the wording of the prompt.',
  })
  requiredChannel!: ContactChannelRequirementEnum;

  @Field({ description: 'The phone number has been confirmed by a code.' })
  phoneVerified!: boolean;

  @Field({ description: 'The email address has been confirmed by a code.' })
  emailVerified!: boolean;

  @Field({ description: 'Whichever contact the operator requires has been confirmed.' })
  contactVerified!: boolean;

  @Field({ description: 'A government ID has been approved by staff.' })
  idVerified!: boolean;

  @Field({
    description:
      'True when the profile is publicly listable. Both halves must hold — a reachable contact AND an approved ID.',
  })
  discoverable!: boolean;

  @Field(() => String, {
    nullable: true,
    description:
      'Where a code would be sent, already chosen against the required channel, so the banner can request one without asking the worker to retype an address we already hold. Null when no usable contact is on file.',
  })
  otpDestination!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Which channel `otpDestination` belongs to: "PHONE" or "EMAIL".',
  })
  otpChannel!: string | null;
}
