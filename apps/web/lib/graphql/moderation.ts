import { gql } from '@apollo/client';
import type {
  AbuseReportStatus,
  ModerationActionType,
  ReportReason,
  ReportTargetType,
} from '@/lib/reports';

/**
 * Reporting & moderation READS (DUAL API RULE; ADM-08). Admin-only. Writes are
 * REST (lib/reports.ts). Mirrors
 * apps/api/src/moderation/models/moderation.model.ts.
 *
 * The queue is GROUPED BY ITEM, not by report: twelve complaints about one photo
 * are one row an admin decides once.
 */

export interface ModerationParty {
  id: string;
  name: string | null;
  avatar: string | null;
  status: string;
  priorActionCount: number;
}

export interface ReportTargetPreview {
  targetType: ReportTargetType;
  targetId: string;
  exists: boolean;
  label: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  url: string | null;
}

export interface ReportGroup {
  target: ReportTargetPreview;
  reportedUser: ModerationParty | null;
  openCount: number;
  totalCount: number;
  status: AbuseReportStatus;
  reasons: ReportReason[];
  firstReportedAt: string;
  lastReportedAt: string;
}

export interface ReportItem {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: AbuseReportStatus;
  reporter: ModerationParty | null;
  createdAt: string;
}

export interface ModerationAction {
  id: string;
  action: ModerationActionType;
  reason: string;
  targetType: ReportTargetType | null;
  targetId: string | null;
  expiresAt: string | null;
  actor: ModerationParty | null;
  createdAt: string;
}

export interface ReportGroupDetail {
  group: ReportGroup;
  reports: ReportItem[];
  history: ModerationAction[];
  removable: boolean;
}

const PARTY_FIELDS = `
  id
  name
  avatar
  status
  priorActionCount
`;

const GROUP_FIELDS = `
  target {
    targetType
    targetId
    exists
    label
    excerpt
    imageUrl
    url
  }
  reportedUser { ${PARTY_FIELDS} }
  openCount
  totalCount
  status
  reasons
  firstReportedAt
  lastReportedAt
`;

export const MODERATION_SUMMARY_QUERY = gql`
  query ModerationSummary {
    moderationSummary {
      openGroups
      openReports
      reviewingGroups
    }
  }
`;

export interface ModerationSummaryQueryResult {
  moderationSummary: {
    openGroups: number;
    openReports: number;
    reviewingGroups: number;
  };
}

export const REPORT_QUEUE_QUERY = gql`
  query ReportQueue($status: [AbuseReportStatus!], $targetType: ReportTargetType, $limit: Int, $offset: Int) {
    reportQueue(status: $status, targetType: $targetType, limit: $limit, offset: $offset) {
      ${GROUP_FIELDS}
    }
  }
`;

export interface ReportQueueQueryResult {
  reportQueue: ReportGroup[];
}

export const REPORT_GROUP_QUERY = gql`
  query ReportGroup($targetType: ReportTargetType!, $targetId: ID!) {
    reportGroup(targetType: $targetType, targetId: $targetId) {
      group { ${GROUP_FIELDS} }
      reports {
        id
        reason
        details
        status
        reporter { ${PARTY_FIELDS} }
        createdAt
      }
      history {
        id
        action
        reason
        targetType
        targetId
        expiresAt
        actor { ${PARTY_FIELDS} }
        createdAt
      }
      removable
    }
  }
`;

export interface ReportGroupQueryResult {
  reportGroup: ReportGroupDetail | null;
}
