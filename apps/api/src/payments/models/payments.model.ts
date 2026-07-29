import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  DisputeFaultParty,
  DisputeResolution,
  DisputeStatus,
  EscrowState,
  PaymentMethodType,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
} from '@kavio/database';

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

  @Field(() => DisputeFaultParty, {
    description:
      'Who the admin found at fault (ADM-05). NONE until resolved, and on a no-fault outcome.',
  })
  faultParty!: DisputeFaultParty;

  @Field(() => [DisputeMessageView])
  messages!: DisputeMessageView[];

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({
  description:
    'One entry in a dispute’s combined history (ADM-05): the escrow’s money moves plus the case’s own milestones, oldest first.',
})
export class DisputeHistoryEntryView {
  @Field(() => String, {
    description: 'What kind of entry: ESCROW_MOVE or DISPUTE_EVENT. Drives how the row renders.',
  })
  kind!: string;

  @Field(() => String, {
    description:
      'i18n key for the headline. A key, never a sentence — the EN/FR copy lives in the web catalogue.',
  })
  labelKey!: string;

  @Field(() => EscrowState, {
    nullable: true,
    description: 'The escrow state, for ESCROW_MOVE rows.',
  })
  escrowState!: EscrowState | null;

  @Field(() => ID, { nullable: true, description: 'Who caused it. Null for webhook-driven moves.' })
  actorId!: string | null;

  @Field(() => String, { nullable: true })
  note!: string | null;

  @Field(() => Date)
  occurredAt!: Date;
}

@ObjectType({
  description:
    'The admin dispute workspace (ADM-05): details, both parties, the escrow it froze, the full message thread with evidence, and the combined money-plus-case history. Admin-gated.',
})
export class AdminDisputeView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  jobId!: string;

  @Field(() => String, { nullable: true, description: 'The job’s title, for the header.' })
  jobTitle!: string | null;

  @Field(() => ID)
  bookingId!: string;

  @Field(() => ID)
  openedById!: string;

  @Field(() => ID, { description: 'The client party to the disputed booking.' })
  clientId!: string;

  @Field(() => ID, { description: 'The worker party to the disputed booking.' })
  workerId!: string;

  @Field(() => String)
  reason!: string;

  @Field(() => DisputeStatus)
  status!: DisputeStatus;

  @Field(() => DisputeResolution, { nullable: true })
  resolution!: DisputeResolution | null;

  @Field(() => String, { nullable: true })
  resolutionNote!: string | null;

  @Field(() => DisputeFaultParty)
  faultParty!: DisputeFaultParty;

  @Field(() => EscrowState, {
    nullable: true,
    description:
      'The disputed escrow’s current state — DISPUTED while frozen, then its settlement.',
  })
  escrowState!: EscrowState | null;

  @Field(() => Int, { nullable: true, description: 'Whole XAF held by the disputed escrow.' })
  escrowAmount!: number | null;

  @Field(() => [DisputeMessageView], { description: 'The thread with evidence, oldest first.' })
  messages!: DisputeMessageView[];

  @Field(() => [DisputeHistoryEntryView], {
    description: 'Money moves + case milestones, oldest first.',
  })
  history!: DisputeHistoryEntryView[];

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date, { nullable: true })
  resolvedAt!: Date | null;
}
