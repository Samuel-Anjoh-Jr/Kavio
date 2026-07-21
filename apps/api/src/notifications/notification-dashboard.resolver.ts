import { Args, Query, Resolver } from '@nestjs/graphql';
import { RequirePermissions } from '../auth/decorators/auth.decorators';
import { NotificationDashboardService } from './notification-dashboard.service';
import { DeliveryDashboardView } from './models/notification-dashboard.model';

/** Default window when the caller passes no range: the last 30 days. */
const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The admin notification-delivery dashboard READ (GraphQL, per the DUAL API RULE;
 * SRS §26.1, P76). Gated on `admin:access` — an operational surface, staff only.
 */
@Resolver()
export class NotificationDashboardResolver {
  constructor(private readonly dashboard: NotificationDashboardService) {}

  @RequirePermissions('admin:access')
  @Query(() => DeliveryDashboardView, {
    description: 'Notification delivery rates by channel, template and day (SRS §26.1).',
  })
  async notificationDeliveryDashboard(
    @Args('from', { type: () => Date, nullable: true }) from?: Date,
    @Args('to', { type: () => Date, nullable: true }) to?: Date,
  ): Promise<DeliveryDashboardView> {
    const toDate = to ?? new Date();
    const fromDate = from ?? new Date(toDate.getTime() - DEFAULT_WINDOW_MS);
    return this.dashboard.dashboard(fromDate, toDate);
  }
}
