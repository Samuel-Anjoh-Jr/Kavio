'use client';

import { useState, useTransition } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { restPost } from '@/lib/rest-api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

/**
 * The Role Switcher (ACC-07) — first-class, one tap, in primary navigation.
 *
 * It NEVER re-authenticates. `POST /auth/roles/switch` flips which UserRole is
 * active server-side, then `update()` drives the Auth.js jwt callback to refresh
 * the session, and the newly minted access token carries the new `activeRole`
 * claim. Tier and Trust Score live on the IDENTITY, so nothing about the user's
 * verification state changes — which is the entire promise of the feature.
 *
 * Roles a user does not hold are not offered here: adding one is a separate,
 * deliberate action (`POST /auth/roles`), not a side effect of switching.
 */

/** Roles a person can act as. AGENT/ADMIN are staff surfaces, never switchable here. */
const SWITCHABLE_ROLES = ['WORKER', 'CLIENT', 'BUSINESS'] as const;

type SwitchableRole = (typeof SWITCHABLE_ROLES)[number];

function isSwitchable(role: string): role is SwitchableRole {
  return (SWITCHABLE_ROLES as readonly string[]).includes(role);
}

export function RoleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('Roles');
  const translateError = useAuthErrorMessage();
  const { data: session, update } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [switching, setSwitching] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeRole = session?.user?.activeRole ?? '';
  const roles = (session?.user?.roles ?? []).filter(isSwitchable);

  // A single-role identity has nothing to switch between; rendering a dropdown
  // with one option would be noise in the primary nav.
  if (!session || roles.length < 2 || !isSwitchable(activeRole)) {
    return null;
  }

  async function onSelect(role: SwitchableRole) {
    if (role === activeRole || switching) return;

    setSwitching(role);

    try {
      await restPost('auth/roles/switch', { role });

      // Pulls a fresh token pair through the jwt callback. The refreshed access
      // token is minted from the database, which now says this role is active.
      await update();

      // Re-render server components so the role-based home and any RBAC-gated
      // affordances reflect the new role immediately, not on next navigation.
      startTransition(() => router.refresh());

      toast({ title: t('switched', { role: t(`names.${role}`) }) });
    } catch (error) {
      toast({ variant: 'danger', title: translateError(error) });
    } finally {
      setSwitching(null);
    }
  }

  const busy = switching !== null || isPending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        aria-label={t('switcherLabel')}
        className={cn(
          'inline-flex items-center gap-2 rounded-button border border-input bg-surface px-3 py-2 text-sm font-medium text-surface-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
          className,
        )}
      >
        {busy ? (
          <Loader2 aria-hidden className="animate-spin" />
        ) : (
          <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
        )}
        <span>{t(`names.${activeRole}`)}</span>
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('switcherLabel')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles.map((role) => (
          <DropdownMenuItem
            key={role}
            onSelect={() => void onSelect(role)}
            className="flex items-start gap-2"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {role === activeRole && <Check aria-hidden className="text-primary" />}
            </span>
            <span className="flex flex-col">
              <span className="font-medium">{t(`names.${role}`)}</span>
              <span className="text-xs text-muted-foreground">{t(`descriptions.${role}`)}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
