'use client';

import { useTranslations } from 'next-intl';
import { BadgeCheck, Clock, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  tierPresentation,
  type TierIcon,
  type TrustTone,
  type VerificationTier,
} from '@/lib/trust';
import { cn } from '@/lib/utils';

/**
 * The tier badge (TRU-02), with the explicit "Basic Profile" variant for
 * unverified identities (TRU-03).
 *
 * Tier 0 is the case this component exists to get right. It renders in muted
 * neutral with NO icon and the literal words "Basic Profile" — no checkmark, no
 * shield, no green. A stranger scanning a profile list must be able to tell an
 * unverified worker from a verified one at a glance, and the failure mode we are
 * designing against is a badge that reads as a credential simply because it is a
 * badge.
 */

const ICONS: Record<Exclude<TierIcon, 'none'>, LucideIcon> = {
  clock: Clock,
  'shield-check': ShieldCheck,
  'badge-check': BadgeCheck,
  'shield-alert': ShieldAlert,
};

const TONE_CLASS: Record<TrustTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  accent: 'border-accent/25 bg-accent/10 text-accent',
  success: 'border-success/25 bg-success/10 text-success',
  primary: 'border-primary/25 bg-primary/10 text-primary',
  danger: 'border-danger/25 bg-danger/10 text-danger',
};

export function TierBadge({
  tier,
  suspended = false,
  size = 'md',
  className,
}: {
  tier: VerificationTier;
  suspended?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = useTranslations('Trust');
  const { tone, icon } = tierPresentation(tier, suspended);
  const Icon = icon === 'none' ? null : ICONS[icon];

  // The suspension label replaces the tier label outright. Showing "Verified
  // Professional (suspended)" would leave the credential on screen next to the
  // reason it is void.
  const label = suspended ? t('suspendedShort') : t(`tier.${tier}`);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden className={size === 'sm' ? 'size-3' : 'size-3.5'} />}
      {label}
    </span>
  );
}
