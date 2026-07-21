import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  DisputeResolution,
  DisputeStatus,
  EscrowState,
  PaymentMethodType,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
} from '@trustpro/database';

/**
 * Payments READ models (PROMPTS 63, 66, 68; PAY-05). GraphQL, per the DUAL API
 * RULE — every write is on the REST controllers. Amounts are whole XAF.
 */

@ObjectType({ description: 'A saved way to pay or be paid (PAY-04).' })
export class PaymentMethodView {
  @Field(() => ID)
  id!: string;

  @Field(() => PaymentMethodType)
  type!: PaymentMethodType;

  @Field(() => String)
  label!: string;

  @Field(() => String, { nullable: true, description: 'E.164 for a Mobile Money method.' })
  phone!: string | null;

  @Field(() => String, { nullable: true })
  maskedAccount!: string | null;

  @Field(() => String, { nullable: true })
  operator!: string | null;

  @Field(() => Boolean)
  isDefault!: boolean;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({ description: 'A single money movement in the ledger (PAY-05).' })
export class TransactionView {
  @Field(() => ID)
  id!: string;

  @Field(() => TransactionType)
  type!: TransactionType;

  @Field(() => TransactionStatus)
  status!: TransactionStatus;

  @Field(() => TransactionDirection, { description: 'Money in or out from your side.' })
  direction!: TransactionDirection;

  @Field(() => Int, { description: 'Whole XAF, always positive.' })
  amount!: number;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Coded failure reason for localized copy (PAY-06).',
  })
  failureReason!: string | null;

  @Field(() => ID, { nullable: true })
  bookingId!: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date, { nullable: true })
  settledAt!: Date | null;
}

@ObjectType({ description: 'The wallet overview: balance, escrow and last movement (PAY-05).' })
export class WalletView {
  @Field(() => Int, { description: 'Withdrawable balance in XAF.' })
  availableBalance!: number;

  @Field(() => Int, {
    description: 'Your money currently held in escrow as a client (funds you have paid).',
  })
  inEscrow!: number;

  @Field(() => Int, {
    description: 'Money being held for you as a worker, released on client confirmation.',
  })
  pendingPayout!: number;

  @Field(() => String, { description: 'Always XAF.' })
  currency!: string;

  @Field(() => TransactionView, { nullable: true, description: 'The most recent movement.' })
  lastTransaction!: TransactionView | null;
}

@ObjectType({ description: 'One move an escrow made through the money states (PAY-02).' })
export class EscrowEventView {
  @Field(() => EscrowState, { nullable: true })
  fromState!: EscrowState | null;

  @Field(() => EscrowState)
  toState!: EscrowState;

  @Field(() => String, { nullable: true })
  note!: string | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({ description: 'The escrow timeline for a booking (PAY-01, PAY-02).' })
export class EscrowView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  bookingId!: string;

  @Field(() => EscrowState)
  state!: EscrowState;

  @Field(() => Int)
  amount!: number;

  @Field(() => Int, { description: 'Platform service fee (~10%), shown transparently.' })
  feeAmount!: number;

  @Field(() => Int, { description: 'What the worker receives on release.' })
  payoutAmount!: number;

  @Field(() => [EscrowEventView], { description: 'The state timeline, oldest first.' })
  timeline!: EscrowEventView[];

  @Field(() => Date)
  paidAt!: Date;

  @Field(() => Date, { nullable: true })
  releasedAt!: Date | null;
}

@ObjectType({ description: 'A file attached to a dispute message (PAY-03).' })
export class DisputeAttachmentView {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true, description: 'Signed URL — dispute evidence is private.' })
  url!: string | null;
}

@ObjectType({ description: 'A message in a dispute thread (PAY-03).' })
export class DisputeMessageView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  authorId!: string;

  @Field(() => String)
  body!: string;

  @Field(() => [DisputeAttachmentView])
  attachments!: DisputeAttachmentView[];

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({ description: 'A dispute over a job’s escrow (PAY-03, ADM-05).' })
export class DisputeView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  jobId!: string;

  @Field(() => ID)
  bookingId!: string;

  @Field(() => ID)
  openedById!: string;

  @Field(() => String)
  reason!: string;

  @Field(() => DisputeStatus)
  status!: DisputeStatus;

  @Field(() => DisputeResolution, { nullable: true })
  resolution!: DisputeResolution | null;

  @Field(() => String, { nullable: true })
  resolutionNote!: string | null;

  @Field(() => [DisputeMessageView])
  messages!: DisputeMessageView[];

  @Field(() => Date)
  createdAt!: Date;
}
