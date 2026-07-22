import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { NotificationCategory, NotificationChannel } from '@trustpro/database';

/**
 * Notification Center READ models (NOT-02). GraphQL, per the DUAL API RULE —
 * mark-as-read and preference updates are REST writes on NotificationsController.
 *
 * The enums these fields use are registered once in graphql/enums.ts, never here.
 */

@ObjectType({ description: 'One row in the Notification Center (NOT-02).' })
export class NotificationView {
  @Field(() => ID)
  id!: string;

  @Field(() => NotificationCategory)
  category!: NotificationCategory;

  @Field(() => String, { description: 'The template that produced it — not shown to the user.' })
  templateKey!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  body!: string;

  @Field(() => String, {
    nullable: true,
    description: 'App-relative deep link to the surface this is about (NOT-02).',
  })
  url!: string | null;

  @Field(() => Boolean, { description: 'Drives the Important filter.' })
  important!: boolean;

  @Field(() => Date, { nullable: true })
  readAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({ description: 'A page of notifications with its unread total (NOT-02).' })
export class NotificationFeedView {
  @Field(() => [NotificationView])
  items!: NotificationView[];

  @Field(() => Int, { description: "The caller's unread total across all filters." })
  unreadCount!: number;

  @Field(() => Boolean, { description: 'Whether another page exists after this one.' })
  hasMore!: boolean;
}

@ObjectType({
  description: 'One channel × category preference cell (NOT-02, SET-02).',
})
export class NotificationPreferenceView {
  @Field(() => NotificationChannel)
  channel!: NotificationChannel;

  @Field(() => NotificationCategory)
  category!: NotificationCategory;

  @Field(() => Boolean)
  enabled!: boolean;
}

@ObjectType({
  description:
    'A channel as the preferences screen sees it. `available` false means the channel is ' +
    'built and wired but switched off platform-wide — SMS at launch, shown as coming soon.',
})
export class NotificationChannelStatusView {
  @Field(() => NotificationChannel)
  channel!: NotificationChannel;

  @Field(() => Boolean)
  available!: boolean;
}

@ObjectType({ description: "The preferences screen's full state (NOT-02)." })
export class NotificationSettingsView {
  @Field(() => [NotificationPreferenceView])
  preferences!: NotificationPreferenceView[];

  @Field(() => [NotificationChannelStatusView], {
    description: 'Every channel and whether it can currently deliver.',
  })
  channels!: NotificationChannelStatusView[];

  @Field(() => Boolean, {
    description: 'Whether this identity has at least one live web-push subscription.',
  })
  pushSubscribed!: boolean;
}
