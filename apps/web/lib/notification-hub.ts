import type { NotificationCategory } from '@/lib/graphql/notifications';

/**
 * Notification hub groups (bell -> Activity / Support / Announcements /
 * Warnings), on top of the All / Unread / Important filter.
 */
export type HubGroup = 'ALL' | 'ACTIVITY' | 'SUPPORT' | 'ANNOUNCEMENTS' | 'WARNINGS';
export const HUB_GROUPS: readonly HubGroup[] = [
  'ALL',
  'ACTIVITY',
  'SUPPORT',
  'ANNOUNCEMENTS',
  'WARNINGS',
];

const WARNING_CATEGORIES: readonly NotificationCategory[] = [
  'SECURITY',
  'ACCOUNT',
  'DISPUTES',
  'SAFETY',
];

export function hubGroupOf(n: {
  category: NotificationCategory;
  templateKey: string;
}): Exclude<HubGroup, 'ALL'> {
  const key = n.templateKey.toLowerCase();
  if (WARNING_CATEGORIES.includes(n.category) || /rejected|failed|suspend|expired/.test(key)) {
    return 'WARNINGS';
  }
  if (n.category === 'MARKETING' || key.startsWith('admin.announcement')) return 'ANNOUNCEMENTS';
  if (key.startsWith('support.') || key.startsWith('report.') || key.startsWith('moderation.')) {
    return 'SUPPORT';
  }
  return 'ACTIVITY';
}

export interface TrustNudge {
  id: 'phone' | 'photo' | 'identity' | 'contact';
  done: boolean;
  href: string;
}

const TIER_RANK: Record<string, number> = { TIER_0: 0, TIER_1: 1, TIER_2: 2, TIER_3: 3 };

/** Trust steps (progressive verification) for the signed-in identity. */
export function trustNudges(
  me: { phone: string | null; avatar: string | null; tier: string } | null | undefined,
  hasTrustedContact: boolean,
): TrustNudge[] {
  if (!me) return [];
  return [
    { id: 'phone', done: Boolean(me.phone), href: '/app/settings/profile' },
    { id: 'photo', done: Boolean(me.avatar), href: '/app/settings/profile' },
    { id: 'identity', done: (TIER_RANK[me.tier] ?? 0) >= 2, href: '/app/verification' },
    { id: 'contact', done: hasTrustedContact, href: '/app/safety' },
  ];
}
