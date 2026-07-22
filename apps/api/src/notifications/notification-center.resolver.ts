import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { NotificationCenterService, type NotificationFilter } from './notification-center.service';
import { NotificationFeedView, NotificationSettingsView } from './models/notification.model';

/**
 * Notification Center READS (GraphQL, per the DUAL API RULE; NOT-02). Writes —
 * mark-as-read and preference toggles — are on NotificationsController.
 *
 * Nothing here is @Public(): an inbox is private, and every query resolves only
 * the caller's own rows (scoped in the service's WHERE, never by an argument the
 * client supplies).
 */
@Resolver()
export class NotificationCenterResolver {
  constructor(private readonly center: NotificationCenterService) {}

  @Query(() => NotificationFeedView, {
    description:
      "A page of the caller's Notification Center, newest first (NOT-02). `filter` is ALL, UNREAD or IMPORTANT.",
  })
  async myNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Args('filter', { type: () => String, nullable: true }) filter?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('before', { type: () => Date, nullable: true }) before?: Date,
  ): Promise<NotificationFeedView> {
    return this.center.feed(user, normaliseFilter(filter), limit ?? 20, before);
  }

  @Query(() => Int, {
    description: "The caller's unread notification count — the app-shell bell badge (NOT-02).",
  })
  async unreadNotificationCount(@CurrentUser() user: AuthenticatedUser): Promise<number> {
    return this.center.unreadCount(user);
  }

  @Query(() => NotificationSettingsView, {
    description:
      'The per-channel × category preference grid, which channels can currently deliver, and whether this identity has a live push subscription (NOT-02, SET-02).',
  })
  async myNotificationSettings(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationSettingsView> {
    return this.center.settings(user);
  }
}

/** An unknown filter falls back to ALL rather than erroring on a UI typo. */
function normaliseFilter(value: string | undefined): NotificationFilter {
  const upper = value?.toUpperCase();
  return upper === 'UNREAD' || upper === 'IMPORTANT' ? upper : 'ALL';
}
