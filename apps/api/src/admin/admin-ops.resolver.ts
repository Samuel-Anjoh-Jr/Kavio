import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import { AnnouncementStatus } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { AdminOpsService } from './admin-ops.service';
import {
  AnnouncementView,
  AuditLogPageView,
  RbacMatrixView,
  SystemSettingView,
} from './models/admin-ops.model';

/**
 * Admin operations reads (ADM-02, ADM-07). GraphQL per the DUAL API RULE.
 *
 * Two permissions are in play, not one. `admin:settings_manage` covers platform
 * configuration and announcements; the audit log and the RBAC matrix sit behind
 * `admin:access` because reading who did what is oversight rather than control,
 * and an operator who cannot change settings should still be able to review
 * them being changed.
 *
 * `myAnnouncements` is the odd one out: it is a read for ORDINARY users, which
 * is the whole point of publishing an announcement, so it is gated only on being
 * signed in and filters by the caller's own roles server-side.
 */
@Resolver()
export class AdminOpsResolver {
  constructor(private readonly ops: AdminOpsService) {}

  @RequirePermissions('admin:settings_manage')
  @Query(() => [AnnouncementView], { description: 'Announcements, drafts included (ADM-07).' })
  async adminAnnouncements(
    @Args('status', { type: () => AnnouncementStatus, nullable: true })
    status?: AnnouncementStatus,
  ): Promise<AnnouncementView[]> {
    return this.ops.listAnnouncements(status ?? undefined);
  }

  @Query(() => [AnnouncementView], {
    description:
      'Live announcements for the calling user, matched against their roles at read time (ADM-07).',
  })
  async myAnnouncements(@CurrentUser() user: AuthenticatedUser): Promise<AnnouncementView[]> {
    return this.ops.liveAnnouncements(user.roles);
  }

  @RequirePermissions('admin:access')
  @Query(() => AuditLogPageView, {
    description: 'The audit log (ADM-07). Append-only — there is no write path to it.',
  })
  async adminAuditLog(
    @Args('action', { type: () => String, nullable: true }) action?: string,
    @Args('actorId', { type: () => ID, nullable: true }) actorId?: string,
    @Args('from', { type: () => String, nullable: true }) from?: string,
    @Args('to', { type: () => String, nullable: true }) to?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<AuditLogPageView> {
    return this.ops.listAuditLog({
      action: action?.trim() || undefined,
      actorId: actorId ?? undefined,
      from: from ?? undefined,
      to: to ?? undefined,
      limit: limit ?? undefined,
      offset: offset ?? undefined,
    });
  }

  @RequirePermissions('admin:access')
  @Query(() => [String], { description: 'Distinct audit action keys, for the filter (ADM-07).' })
  async adminAuditActions(): Promise<string[]> {
    return this.ops.auditActions();
  }

  @RequirePermissions('admin:access')
  @Query(() => RbacMatrixView, {
    description:
      'The roles-and-permissions matrix (ADM-07). Read-only: the catalogue is declared in code because the guards read it from there.',
  })
  adminRbacMatrix(): RbacMatrixView {
    return this.ops.rbacMatrix();
  }

  @RequirePermissions('admin:settings_manage')
  @Query(() => [SystemSettingView], {
    description: 'Platform settings and their current values (ADM-07). Never secrets.',
  })
  async adminSettings(): Promise<SystemSettingView[]> {
    return this.ops.listSettings();
  }
}
