import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

/**
 * Admin delivery-dashboard READ models (SRS §26.1, P76). GraphQL, per the DUAL
 * API RULE. Everything is derived from NotificationLog — sent/failed/pending
 * counts sliced by channel, templateKey and day over a date range.
 */

@ObjectType({
  description: 'Delivery counts for one slice (a channel, a template, or the whole range).',
})
export class DeliveryStatView {
  @Field(() => String, {
    description: 'What this slice is keyed on (channel name, templateKey, or "ALL").',
  })
  key!: string;

  @Field(() => Int)
  sent!: number;

  @Field(() => Int)
  failed!: number;

  @Field(() => Int)
  pending!: number;

  @Field(() => Int)
  total!: number;

  @Field(() => Float, { description: 'Sent ÷ total, 0–1; 0 when nothing was attempted.' })
  successRate!: number;
}

@ObjectType({ description: 'Delivery counts for one day.' })
export class DailyDeliveryStatView {
  @Field(() => String, { description: 'ISO date (YYYY-MM-DD), UTC.' })
  date!: string;

  @Field(() => Int)
  sent!: number;

  @Field(() => Int)
  failed!: number;

  @Field(() => Int)
  pending!: number;
}

@ObjectType({ description: 'The admin notification-delivery dashboard (SRS §26.1).' })
export class DeliveryDashboardView {
  @Field(() => Date)
  from!: Date;

  @Field(() => Date)
  to!: Date;

  @Field(() => DeliveryStatView, { description: 'Totals across the whole range.' })
  totals!: DeliveryStatView;

  @Field(() => [DeliveryStatView], { description: 'One row per channel.' })
  byChannel!: DeliveryStatView[];

  @Field(() => [DeliveryStatView], {
    description: 'One row per templateKey, most-attempted first.',
  })
  byTemplate!: DeliveryStatView[];

  @Field(() => [DailyDeliveryStatView], { description: 'Per-day counts across the range.' })
  byDay!: DailyDeliveryStatView[];
}
