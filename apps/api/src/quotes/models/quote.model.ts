import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { BookingStatus, QuoteDurationUnit, QuoteStatus } from '@kavio/database';
import { WorkerPreviewView } from '../../jobs/models/job.model';

/**
 * Quote & booking READ models (PROMPTS 59, 60; QTE-04). GraphQL, per the DUAL
 * API RULE — every write is on the REST controllers.
 */

@ObjectType({ description: 'A file attached to a quote (QTE-01).' })
export class QuoteAttachmentView {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true, description: 'Signed URL — quote files are private.' })
  url!: string | null;
}

@ObjectType({ description: "A worker's priced offer on a job (QTE-01, QTE-03)." })
export class QuoteView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  jobId!: string;

  @Field(() => String, { nullable: true })
  jobTitle!: string | null;

  @Field(() => ID, { description: 'The worker who sent it.' })
  workerId!: string;

  @Field(() => Int, { description: 'Fixed price in XAF (QTE-01).' })
  price!: number;

  @Field(() => Int, { nullable: true })
  durationValue!: number | null;

  @Field(() => QuoteDurationUnit, { nullable: true })
  durationUnit!: QuoteDurationUnit | null;

  @Field(() => [String], { description: 'The itemised "what’s included" (QTE-01).' })
  includes!: string[];

  @Field(() => String, { nullable: true })
  message!: string | null;

  @Field(() => QuoteStatus)
  status!: QuoteStatus;

  @Field(() => Int, {
    description:
      'The current platform escrow fee, in basis points (admin-configurable, PAY-01). ' +
      'Lets the accept screen preview the exact split before a booking snapshots it.',
  })
  platformFeeBps!: number;

  @Field(() => [QuoteAttachmentView])
  attachments!: QuoteAttachmentView[];

  @Field(() => WorkerPreviewView, {
    nullable: true,
    description: 'Worker context for the client’s quote view — Trust Score, rating (QTE-02).',
  })
  worker!: WorkerPreviewView | null;

  @Field(() => ID, { nullable: true, description: 'The quote this one revised, if any.' })
  parentQuoteId!: string | null;

  @Field(() => Int, {
    nullable: true,
    description: 'The client’s suggested counter price, when one was requested (QTE-02).',
  })
  counterTargetPrice!: number | null;

  @Field(() => String, { nullable: true })
  counterMessage!: string | null;

  @Field(() => Date, { nullable: true })
  sentAt!: Date | null;

  @Field(() => Date, { nullable: true })
  viewedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  expiresAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({
  description: "A worker's or client's quote inbox lane (Sent / Received / Drafts) (QTE-04).",
})
export class QuoteInboxView {
  @Field(() => [QuoteView], { description: 'Quotes the worker has sent (or is drafting).' })
  sent!: QuoteView[];

  @Field(() => [QuoteView], { description: 'Draft quotes not yet sent.' })
  drafts!: QuoteView[];
}

@ObjectType({ description: 'A booking: an accepted quote as an agreement (QTE-03, PAY-01).' })
export class BookingView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  jobId!: string;

  @Field(() => String, { nullable: true })
  jobTitle!: string | null;

  @Field(() => ID)
  quoteId!: string;

  @Field(() => ID)
  workerId!: string;

  @Field(() => ID)
  clientId!: string;

  @Field(() => Int, { description: 'The agreed price in XAF.' })
  agreedPrice!: number;

  @Field(() => Int, { description: 'Platform fee in XAF, snapshotted at acceptance (~10%).' })
  platformFeeAmount!: number;

  @Field(() => Int, { description: 'What the worker receives after the fee.' })
  workerPayoutAmount!: number;

  @Field(() => BookingStatus)
  status!: BookingStatus;

  @Field(() => Date)
  createdAt!: Date;
}
