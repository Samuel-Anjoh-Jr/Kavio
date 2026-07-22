import { gql } from '@apollo/client';

/**
 * Notification Center READS (DUAL API RULE). Writes are REST
 * (lib/notifications.ts). Mirrors
 * apps/api/src/notifications/models/notification.model.ts.
 */

export type NotificationChannel = 'IN_APP' | 'WEB_PUSH' | 'EMAIL' | 'SMS';

export type NotificationCategory =
  | 'SECURITY'
  | 'ACCOUNT'
  | 'JOBS'
  | 'QUOTES'
  | 'MESSAGES'
  | 'PAYMENTS'
  | 'TRUST'
  | 'REVIEWS'
  | 'DISPUTES'
  | 'SAFETY'
  | 'MARKETING';

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  templateKey: string;
  title: string;
  body: string;
  url: string | null;
  important: boolean;
  readAt: string | null;
  createdAt: string;
}

export const NOTIFICATIONS_QUERY = gql`
  query MyNotifications($filter: String, $limit: Int, $before: DateTime) {
    myNotifications(filter: $filter, limit: $limit, before: $before) {
      items {
        id
        category
        templateKey
        title
        body
        url
        important
        readAt
        createdAt
      }
      unreadCount
      hasMore
    }
  }
`;

export interface NotificationsQueryResult {
  myNotifications: {
    items: AppNotification[];
    unreadCount: number;
    hasMore: boolean;
  };
}

/** The header bell badge (NOT-02). */
export const UNREAD_NOTIFICATIONS_QUERY = gql`
  query UnreadNotificationCount {
    unreadNotificationCount
  }
`;

export interface UnreadNotificationsQueryResult {
  unreadNotificationCount: number;
}

export interface NotificationPreferenceCell {
  channel: NotificationChannel;
  category: NotificationCategory;
  enabled: boolean;
}

export interface NotificationChannelStatus {
  channel: NotificationChannel;
  /** False = built and wired but switched off platform-wide (SMS at launch). */
  available: boolean;
}

export const NOTIFICATION_SETTINGS_QUERY = gql`
  query MyNotificationSettings {
    myNotificationSettings {
      preferences {
        channel
        category
        enabled
      }
      channels {
        channel
        available
      }
      pushSubscribed
    }
  }
`;

export interface NotificationSettingsQueryResult {
  myNotificationSettings: {
    preferences: NotificationPreferenceCell[];
    channels: NotificationChannelStatus[];
    pushSubscribed: boolean;
  };
}
