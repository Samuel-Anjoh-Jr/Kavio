import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAnalyticsResolver } from './admin-analytics.resolver';
import { AgentInvitationNotificationListener } from './agent-invitation-notification.listener';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminOpsResolver } from './admin-ops.resolver';
import { AdminOpsService } from './admin-ops.service';
import { AdminRiskResolver } from './admin-risk.resolver';
import { AdminRiskService } from './admin-risk.service';
import { AdminUsersResolver } from './admin-users.resolver';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';

/**
 * The admin console's own module (PROMPT 83, 86, 87, 88; ADM-01, ADM-02,
 * ADM-06, ADM-07).
 *
 * It owns the surfaces that are ABOUT the platform rather than about one
 * feature: cross-cutting analytics, the risk monitor, the account directory,
 * agent invitations, announcements, the audit-log viewer, the RBAC matrix and
 * platform settings.
 *
 * ── What it deliberately does not own ───────────────────────────────────────
 *
 * The other admin surfaces live with the features they act on, and that is the
 * rule that keeps this module from turning into a second copy of the
 * application:
 *
 *   ADM-03 verification queue      → VerificationModule
 *   ADM-04 Trust Score adjustment  → TrustModule
 *   ADM-05 dispute workspace       → PaymentsModule (disputes)
 *   ADM-08 moderation workspace    → ModerationModule
 *   ADM-02 service taxonomy CRUD   → CatalogModule
 *
 * Each of those already has the domain rules, the state machine and the audit
 * trail for its own writes. An "admin" module that re-implemented them would be
 * a parallel set of rules that drifts — and the drift would be in exactly the
 * paths where an admin's word is final.
 *
 * PrismaModule is the only import: every read here is an aggregate the console
 * needs, and depending on the feature modules would invert the layering — they
 * are the ones that own their domains, not this.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [
    AdminAnalyticsService,
    AdminAnalyticsResolver,
    AgentInvitationNotificationListener,
    AdminRiskService,
    AdminRiskResolver,
    AdminUsersService,
    AdminUsersResolver,
    AdminOpsService,
    AdminOpsResolver,
  ],
  exports: [AdminOpsService],
})
export class AdminModule {}
