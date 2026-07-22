import { gql } from '@apollo/client';

/**
 * Admin console READS (DUAL API RULE; ADM-01, ADM-02, ADM-06, ADM-07). Writes
 * are REST (lib/admin.ts). Mirrors apps/api/src/admin/models/*.
 *
 * Every field that can be "not measured yet" is nullable here because it is
 * nullable there — `average`, `delta`, `hireRate`, `averageResolutionHours`.
 * Coercing them to 0 in the client would put fabricated numbers on the charts an
 * operator makes decisions from, which is the one thing this console must not do.
 */

export interface Kpi {
  key: string;
  value: number;
  previous: number | null;
  /** Fraction, e.g. 0.12 for +12%. NULL when the previous window was zero. */
  delta: number | null;
}

export interface TimePoint {
  bucket: string;
  value: number;
}

export interface TimeSeries {
  key: string;
  /** Every day in the range, including the empty ones. */
  points: TimePoint[];
}

export interface BreakdownSlice {
  id: string | null;
  label: string;
  value: number;
  share: number;
}

export interface EscrowOverview {
  activeHolds: number;
  heldAmount: number;
  releasedAmount: number;
  refundedAmount: number;
  disputedHolds: number;
}

export interface DisputeOverview {
  open: number;
  underReview: number;
  resolvedInWindow: number;
  frozenAmount: number;
  averageResolutionHours: number | null;
}

export interface SosOverview {
  active: number;
  raisedInWindow: number;
  resolvedInWindow: number;
  lastRaisedAt: string | null;
}

export interface SystemHealth {
  status: string;
  databaseUp: boolean;
  databaseLatencyMs: number | null;
  failedNotifications: number;
  stalePendingTransactions: number;
}

export interface AdminDashboard {
  windowDays: number;
  kpis: Kpi[];
  series: TimeSeries[];
  jobsByCategory: BreakdownSlice[];
  escrow: EscrowOverview;
  disputes: DisputeOverview;
  sos: SosOverview;
  health: SystemHealth;
}

export const ADMIN_DASHBOARD_QUERY = gql`
  query AdminDashboard($windowDays: Int) {
    adminDashboard(windowDays: $windowDays) {
      windowDays
      kpis {
        key
        value
        previous
        delta
      }
      series {
        key
        points {
          bucket
          value
        }
      }
      jobsByCategory {
        id
        label
        value
        share
      }
      escrow {
        activeHolds
        heldAmount
        releasedAmount
        refundedAmount
        disputedHolds
      }
      disputes {
        open
        underReview
        resolvedInWindow
        frozenAmount
        averageResolutionHours
      }
      sos {
        active
        raisedInWindow
        resolvedInWindow
        lastRaisedAt
      }
      health {
        status
        databaseUp
        databaseLatencyMs
        failedNotifications
        stalePendingTransactions
      }
    }
  }
`;

export interface AdminDashboardQueryResult {
  adminDashboard: AdminDashboard;
}

export interface TopPerformer {
  userId: string;
  name: string | null;
  avatar: string | null;
  completedJobs: number;
  averageRating: number | null;
  trustScore: number;
  earned: number;
}

export interface AdminAnalytics {
  windowDays: number;
  series: TimeSeries[];
  jobsByCategory: BreakdownSlice[];
  jobsByLocation: BreakdownSlice[];
  revenueBySource: BreakdownSlice[];
  trustScoreDistribution: BreakdownSlice[];
  topPerformers: TopPerformer[];
}

export const ADMIN_ANALYTICS_QUERY = gql`
  query AdminAnalytics($windowDays: Int) {
    adminAnalytics(windowDays: $windowDays) {
      windowDays
      series {
        key
        points {
          bucket
          value
        }
      }
      jobsByCategory {
        id
        label
        value
        share
      }
      jobsByLocation {
        id
        label
        value
        share
      }
      revenueBySource {
        id
        label
        value
        share
      }
      trustScoreDistribution {
        id
        label
        value
        share
      }
      topPerformers {
        userId
        name
        avatar
        completedJobs
        averageRating
        trustScore
        earned
      }
    }
  }
`;

export interface AdminAnalyticsQueryResult {
  adminAnalytics: AdminAnalytics;
}

// ── Fraud & risk (ADM-06) ───────────────────────────────────────────────────

export interface RiskSignal {
  code: string;
  count: number;
}

export type RiskLevel = 'LOW' | 'ELEVATED' | 'HIGH';

export interface RiskAccount {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  trustScore: number;
  trustSuspended: boolean;
  signals: RiskSignal[];
  level: RiskLevel;
  createdAt: string;
  lastActionAt: string | null;
}

export interface SuspiciousJob {
  jobId: string;
  title: string;
  posterId: string;
  posterName: string | null;
  status: string;
  budgetMax: number | null;
  signals: RiskSignal[];
  level: RiskLevel;
  createdAt: string;
}

export interface BlockedAccount {
  userId: string;
  name: string | null;
  status: string;
  action: string;
  reason: string;
  actorId: string | null;
  actorName: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface AdminRisk {
  windowDays: number;
  highRiskAccounts: RiskAccount[];
  suspiciousJobs: SuspiciousJob[];
  blockedAccounts: BlockedAccount[];
  openReports: number;
}

export const ADMIN_RISK_QUERY = gql`
  query AdminRiskMonitor($windowDays: Int) {
    adminRiskMonitor(windowDays: $windowDays) {
      windowDays
      openReports
      highRiskAccounts {
        userId
        name
        email
        phone
        status
        trustScore
        trustSuspended
        level
        createdAt
        lastActionAt
        signals {
          code
          count
        }
      }
      suspiciousJobs {
        jobId
        title
        posterId
        posterName
        status
        budgetMax
        level
        createdAt
        signals {
          code
          count
        }
      }
      blockedAccounts {
        userId
        name
        status
        action
        reason
        actorId
        actorName
        expiresAt
        createdAt
      }
    }
  }
`;

export interface AdminRiskQueryResult {
  adminRiskMonitor: AdminRisk;
}

export interface ActivityCell {
  latitude: number;
  longitude: number;
  jobCount: number;
  /** 0–1 relative to the busiest cell. What the heat ramp reads. */
  intensity: number;
}

export const ADMIN_HEATMAP_QUERY = gql`
  query AdminActivityHeatmap($windowDays: Int) {
    adminActivityHeatmap(windowDays: $windowDays) {
      latitude
      longitude
      jobCount
      intensity
    }
  }
`;

export interface AdminHeatmapQueryResult {
  adminActivityHeatmap: ActivityCell[];
}

// ── Accounts & agents (ADM-02, ADM-06) ──────────────────────────────────────

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  status: string;
  tier: string;
  trustScore: number;
  roles: string[];
  activeRole: string | null;
  completedJobs: number;
  averageRating: number | null;
  moderationActionCount: number;
  openReportCount: number;
  createdAt: string;
}

export interface AdminUserPage {
  items: AdminUser[];
  total: number;
  hasMore: boolean;
}

export const ADMIN_USERS_QUERY = gql`
  query AdminUsers(
    $query: String
    $role: Role
    $status: UserStatus
    $tier: VerificationTier
    $limit: Int
    $offset: Int
  ) {
    adminUsers(
      query: $query
      role: $role
      status: $status
      tier: $tier
      limit: $limit
      offset: $offset
    ) {
      total
      hasMore
      items {
        id
        name
        email
        phone
        avatar
        status
        tier
        trustScore
        roles
        activeRole
        completedJobs
        averageRating
        moderationActionCount
        openReportCount
        createdAt
      }
    }
  }
`;

export interface AdminUsersQueryResult {
  adminUsers: AdminUserPage;
}

export type AgentInvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export interface AgentInvitation {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: AgentInvitationStatus;
  invitedByName: string | null;
  acceptedUserId: string | null;
  note: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export const ADMIN_AGENT_INVITATIONS_QUERY = gql`
  query AdminAgentInvitations($status: AgentInvitationStatus) {
    adminAgentInvitations(status: $status) {
      id
      name
      email
      phone
      status
      invitedByName
      acceptedUserId
      note
      expiresAt
      acceptedAt
      createdAt
    }
  }
`;

export interface AdminAgentInvitationsQueryResult {
  adminAgentInvitations: AgentInvitation[];
}

// ── Ops: announcements, audit, RBAC, settings (ADM-02, ADM-07) ──────────────

export type AnnouncementAudience = 'ALL' | 'WORKERS' | 'CLIENTS' | 'BUSINESSES' | 'AGENTS';
export type AnnouncementStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Announcement {
  id: string;
  titleEn: string;
  titleFr: string;
  bodyEn: string;
  bodyFr: string;
  audience: AnnouncementAudience;
  status: AnnouncementStatus;
  authorName: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export const ADMIN_ANNOUNCEMENTS_QUERY = gql`
  query AdminAnnouncements($status: AnnouncementStatus) {
    adminAnnouncements(status: $status) {
      id
      titleEn
      titleFr
      bodyEn
      bodyFr
      audience
      status
      authorName
      publishedAt
      expiresAt
      createdAt
    }
  }
`;

export interface AdminAnnouncementsQueryResult {
  adminAnnouncements: Announcement[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  target: string | null;
  requestId: string | null;
  meta: unknown;
  createdAt: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  hasMore: boolean;
}

export const ADMIN_AUDIT_LOG_QUERY = gql`
  query AdminAuditLog($action: String, $actorId: ID, $limit: Int, $offset: Int) {
    adminAuditLog(action: $action, actorId: $actorId, limit: $limit, offset: $offset) {
      total
      hasMore
      items {
        id
        action
        actorId
        actorName
        target
        requestId
        meta
        createdAt
      }
    }
    adminAuditActions
  }
`;

export interface AdminAuditLogQueryResult {
  adminAuditLog: AuditLogPage;
  adminAuditActions: string[];
}

export interface RolePermissions {
  role: string;
  permissions: string[];
}

export interface RbacMatrix {
  permissions: string[];
  roles: RolePermissions[];
  /** False: the catalogue is declared in code, because the guards read it there. */
  editable: boolean;
}

export const ADMIN_RBAC_QUERY = gql`
  query AdminRbacMatrix {
    adminRbacMatrix {
      permissions
      editable
      roles {
        role
        permissions
      }
    }
  }
`;

export interface AdminRbacQueryResult {
  adminRbacMatrix: RbacMatrix;
}

export interface SystemSetting {
  key: string;
  value: unknown;
  category: string;
  description: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

export const ADMIN_SETTINGS_QUERY = gql`
  query AdminSettings {
    adminSettings {
      key
      value
      category
      description
      updatedByName
      updatedAt
    }
  }
`;

export interface AdminSettingsQueryResult {
  adminSettings: SystemSetting[];
}
