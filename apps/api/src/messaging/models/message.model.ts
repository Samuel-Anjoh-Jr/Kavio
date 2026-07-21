import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { MessageKind, MessageStatus } from '@trustpro/database';

/**
 * Messaging READ models (MSG-01, MSG-02). GraphQL, per the DUAL API RULE — every
 * write is on MessagingController.
 *
 * `metadata` is projected into typed scalar fields (lat/lng, refId) rather than a
 * raw JSON blob, so a client renders a card or a pin without parsing an opaque
 * object and without a JSON scalar in the schema.
 */

@ObjectType({ description: 'The other party in a conversation, previewed.' })
export class ConversationPeerView {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  avatar!: string | null;
}

@ObjectType({ description: 'A file attached to a message (MSG-01).' })
export class MessageAttachmentView {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true, description: 'Signed URL — message media is private.' })
  url!: string | null;
}

@ObjectType({ description: 'A message in a conversation (MSG-01, MSG-02).' })
export class MessageView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  conversationId!: string;

  @Field(() => ID)
  senderId!: string;

  @Field(() => MessageKind)
  kind!: MessageKind;

  @Field(() => String, { nullable: true })
  body!: string | null;

  @Field(() => MessageStatus)
  status!: MessageStatus;

  @Field(() => String, {
    nullable: true,
    description: 'Signed URL for the primary image/voice attachment, when present.',
  })
  mediaUrl!: string | null;

  @Field(() => [MessageAttachmentView])
  attachments!: MessageAttachmentView[];

  @Field(() => Float, { nullable: true, description: 'Shared pin latitude (LOCATION kind).' })
  latitude!: number | null;

  @Field(() => Float, { nullable: true, description: 'Shared pin longitude (LOCATION kind).' })
  longitude!: number | null;

  @Field(() => ID, {
    nullable: true,
    description: 'Referenced record id for QUOTE/JOB/PAYMENT card kinds.',
  })
  refId!: string | null;

  @Field(() => Boolean, { description: 'A soft-deleted message renders as a placeholder.' })
  deleted!: boolean;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({ description: 'A conversation as it appears in the inbox list (MSG-01).' })
export class ConversationView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID, { nullable: true })
  jobId!: string | null;

  @Field(() => String, { nullable: true })
  jobTitle!: string | null;

  @Field(() => ConversationPeerView, {
    nullable: true,
    description: 'The other member — messaging is one-to-one at launch.',
  })
  peer!: ConversationPeerView | null;

  @Field(() => String, { nullable: true })
  lastMessagePreview!: string | null;

  @Field(() => Date, { nullable: true })
  lastMessageAt!: Date | null;

  @Field(() => Int, { description: "Messages the caller hasn't read yet." })
  unreadCount!: number;

  @Field(() => Boolean, { description: 'Whether the caller has blocked the peer.' })
  peerBlocked!: boolean;
}

@ObjectType({ description: 'A conversation with a page of its messages (MSG-01).' })
export class ConversationThreadView {
  @Field(() => ConversationView)
  conversation!: ConversationView;

  @Field(() => [MessageView], { description: 'Messages oldest-first within the page.' })
  messages!: MessageView[];
}
