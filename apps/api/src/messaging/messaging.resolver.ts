import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { MessagingReadService } from './messaging-read.service';
import { ConversationThreadView, ConversationView } from './models/message.model';

/**
 * Messaging READS (GraphQL, per the DUAL API RULE; MSG-01, MSG-02). Writes are on
 * MessagingController.
 *
 * No field is @Public(): a conversation is private. Every query resolves only
 * threads the caller is a member of — enforced in the service's WHERE.
 */
@Resolver()
export class MessagingResolver {
  constructor(private readonly read: MessagingReadService) {}

  @Query(() => [ConversationView], {
    description: "The caller's conversation inbox, most recently active first (MSG-01).",
  })
  async myConversations(@CurrentUser() user: AuthenticatedUser): Promise<ConversationView[]> {
    return this.read.myConversations(user);
  }

  @Query(() => ConversationThreadView, {
    description: 'One conversation with a page of messages, oldest-first (MSG-01).',
  })
  async conversation(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('before', { type: () => Date, nullable: true }) before?: Date,
  ): Promise<ConversationThreadView> {
    return this.read.thread(user, id, limit ?? 50, before);
  }

  @Query(() => Int, {
    description: "The caller's total unread message count — the app-shell badge (MSG-02).",
  })
  async unreadMessageCount(@CurrentUser() user: AuthenticatedUser): Promise<number> {
    return this.read.unreadTotal(user);
  }
}
