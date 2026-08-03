'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, MailPlus, Trash2, UserPlus, Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate } from '@/lib/datetime';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { graphqlErrorCode } from '@/lib/graphql/errors';
import {
  ACCESS_LEVEL_TONE,
  TEAM_ACCESS_LEVELS,
  TEAM_ROLES,
  TEAM_STATUS_TONE,
  inviteTeamMember,
  removeTeamMember,
  updateTeamMember,
  type TeamAccessLevel,
  type TeamMemberRole,
} from '@/lib/business';
import {
  BUSINESS_TEAM_QUERY,
  MY_BUSINESS_ACCESS_QUERY,
  type BusinessTeamQueryResult,
  type MyBusinessAccessQueryResult,
  type TeamMember,
} from '@/lib/graphql/business';

/**
 * Team management (BIZ-03): roster, roles, access levels, invitations, status.
 *
 * The two columns that look redundant are not. `role` is the HR label on
 * somebody's seat; `accessLevel` is what the server enforces. Showing both, and
 * editing both independently, is the whole point — a company that promotes its
 * accountant to HR manager has not thereby granted them the payments scope, and
 * a UI that folded the two together would make that impossible to express.
 *
 * An INVITED row grants nothing until it is accepted: the seat has no bound
 * identity, so there is nobody for the server to authorise. The roster says so
 * rather than showing a pending invitee as though they were already staff.
 */
export function TeamManager({ businessProfileId }: { businessProfileId?: string }) {
  const t = useTranslations('BusinessConsole');
  const locale = useLocale();

  const variables = { businessProfileId: businessProfileId ?? null };

  const { data: accessData } = useQuery<MyBusinessAccessQueryResult>(MY_BUSINESS_ACCESS_QUERY, {
    variables,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const { data, loading, error, refetch } = useQuery<BusinessTeamQueryResult>(BUSINESS_TEAM_QUERY, {
    variables,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const access = accessData?.myBusinessAccess;
  const canManage = access?.capabilities.includes('business:team') ?? false;
  const resolvedId = access?.businessProfileId ?? businessProfileId ?? null;

  const members = data?.businessTeam ?? [];

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full rounded-card" />
        <Skeleton className="h-20 w-full rounded-card" />
      </div>
    );
  }

  if (error && members.length === 0) {
    // NO_BUSINESS mirrors business-dashboard.tsx: this identity hasn't
    // finished business onboarding, so there is no team to load yet — not a
    // transient failure worth retrying.
    if (graphqlErrorCode(error) === 'NO_BUSINESS') {
      return (
        <div className="flex flex-col items-start gap-3 rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
          <p>{t('noBusiness')}</p>
          <Button size="sm" asChild>
            <Link href="/app/onboarding/business">{t('noBusinessCta')}</Link>
          </Button>
        </div>
      );
    }

    return (
      <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
        {t('teamLoadError')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('memberCount', { count: members.filter((m) => m.status === 'ACTIVE').length })}
        </p>
        {canManage && resolvedId && (
          <InviteMemberDialog businessProfileId={resolvedId} onInvited={() => void refetch()} />
        )}
      </div>

      {members.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-14 text-center">
          <Users aria-hidden className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t('teamEmpty')}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t('teamEmptyBody')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              businessProfileId={resolvedId}
              canManage={canManage}
              locale={locale}
              onChanged={() => void refetch()}
            />
          ))}
        </ul>
      )}

      {!canManage && (
        <p className="rounded-card border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t('teamReadOnly')}
        </p>
      )}
    </div>
  );
}

/** A seat can hold more than one HR label (BIZ-03) — a checkbox dropdown, not a single-value select. */
function RolesMultiSelect({
  id,
  roles,
  disabled,
  onChange,
}: {
  id: string;
  roles: TeamMemberRole[];
  disabled?: boolean;
  onChange: (roles: TeamMemberRole[]) => void;
}) {
  const t = useTranslations('BusinessConsole');

  function toggle(role: TeamMemberRole) {
    const next = roles.includes(role) ? roles.filter((entry) => entry !== role) : [...roles, role];
    // At least one role always stays selected — there is no "no label" seat.
    if (next.length > 0) onChange(next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-9 max-w-56 justify-start truncate font-normal"
        >
          {roles.map((role) => t(`teamRole.${role}`)).join(', ')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {TEAM_ROLES.map((role) => (
          <DropdownMenuCheckboxItem
            key={role}
            checked={roles.includes(role)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => toggle(role)}
          >
            {t(`teamRole.${role}`)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MemberRow({
  member,
  businessProfileId,
  canManage,
  locale,
  onChanged,
}: {
  member: TeamMember;
  businessProfileId: string | null;
  canManage: boolean;
  locale: string;
  onChanged: () => void;
}) {
  const t = useTranslations('BusinessConsole');
  const translateError = useAuthErrorMessage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = canManage && businessProfileId !== null && member.status !== 'REMOVED';

  async function patch(input: { roles?: TeamMemberRole[]; accessLevel?: TeamAccessLevel }) {
    if (!businessProfileId) return;
    setSaving(true);
    setError(null);
    try {
      await updateTeamMember(businessProfileId, member.id, input);
      onChanged();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!businessProfileId) return;
    setSaving(true);
    setError(null);
    try {
      await removeTeamMember(businessProfileId, member.id);
      onChanged();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-card border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{member.name}</p>
            <StatusBadge
              tone={TEAM_STATUS_TONE[member.status]}
              size="sm"
              label={t(`teamStatus.${member.status}`)}
            />
            <StatusBadge
              tone={ACCESS_LEVEL_TONE[member.accessLevel]}
              size="sm"
              label={t(`accessLevel.${member.accessLevel}`)}
            />
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {member.title ?? member.roles.map((role) => t(`teamRole.${role}`)).join(', ')}
            {member.email ? ` · ${member.email}` : member.phone ? ` · ${member.phone}` : ''}
          </p>

          {/* Invitation state is spelled out rather than implied by a chip: an
              outstanding seat is the one thing a manager most often needs to
              chase, and "sent 9 days ago, expires tomorrow" is the fact that
              prompts them to. */}
          {member.status === 'INVITED' && member.invitationSentAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('invitedOn', { date: formatDate(member.invitationSentAt, locale) ?? '' })}
              {member.invitationExpiresAt
                ? ` · ${t('invitationExpires', { date: formatDate(member.invitationExpiresAt, locale) ?? '' })}`
                : ''}
            </p>
          )}
          {member.status === 'ACTIVE' && member.acceptedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('joinedOn', { date: formatDate(member.acceptedAt, locale) ?? '' })}
            </p>
          )}
        </div>

        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`role-${member.id}`}>
              {t('roleLabel')}
            </label>
            <RolesMultiSelect
              id={`role-${member.id}`}
              roles={member.roles}
              disabled={saving}
              onChange={(roles) => void patch({ roles })}
            />

            <label className="sr-only" htmlFor={`access-${member.id}`}>
              {t('accessLabel')}
            </label>
            <select
              id={`access-${member.id}`}
              value={member.accessLevel}
              disabled={saving}
              onChange={(event) =>
                void patch({ accessLevel: event.target.value as TeamAccessLevel })
              }
              className="h-9 rounded-input border border-input bg-surface px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
            >
              {TEAM_ACCESS_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(`accessLevel.${level}`)}
                </option>
              ))}
            </select>

            <Button
              variant="ghost"
              size="icon"
              disabled={saving}
              aria-label={t('removeMember', { name: member.name })}
              onClick={() => void remove()}
            >
              {saving ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

function InviteMemberDialog({
  businessProfileId,
  onInvited,
}: {
  businessProfileId: string;
  onInvited: () => void;
}) {
  const t = useTranslations('BusinessConsole');
  const translateError = useAuthErrorMessage();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [roles, setRoles] = useState<TeamMemberRole[]>(['STAFF']);
  const [accessLevel, setAccessLevel] = useState<TeamAccessLevel>('VIEW_ONLY');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    // Mirrors the API's refine: an invitation with no way to reach the invitee
    // is a seat that can never be filled, so it is refused before the round trip.
    if (!email.trim() && !phone.trim()) {
      setError(t('contactRequired'));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await inviteTeamMember(businessProfileId, {
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
        roles,
        accessLevel,
      });
      setOpen(false);
      setName('');
      setEmail('');
      setPhone('');
      setTitle('');
      setRoles(['STAFF']);
      setAccessLevel('VIEW_ONLY');
      onInvited();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus aria-hidden />
          {t('inviteMember')}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('inviteTitle')}</DialogTitle>
          <DialogDescription>{t('inviteSubtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-name">{t('nameLabel')}</Label>
            <Input
              id="invite-name"
              value={name}
              required
              minLength={2}
              maxLength={120}
              disabled={submitting}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">{t('emailLabel')}</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              disabled={submitting}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-phone">{t('phoneLabel')}</Label>
            <Input
              id="invite-phone"
              type="tel"
              inputMode="tel"
              placeholder="+237…"
              value={phone}
              disabled={submitting}
              onChange={(event) => setPhone(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('contactHint')}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-title">{t('titleLabel')}</Label>
            <Input
              id="invite-title"
              value={title}
              maxLength={120}
              disabled={submitting}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">{t('roleLabel')}</Label>
              <RolesMultiSelect
                id="invite-role"
                roles={roles}
                disabled={submitting}
                onChange={setRoles}
              />
              <p className="text-xs text-muted-foreground">{t('roleHint')}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-access">{t('accessLabel')}</Label>
              <select
                id="invite-access"
                value={accessLevel}
                disabled={submitting}
                onChange={(event) => setAccessLevel(event.target.value as TeamAccessLevel)}
                className="h-11 rounded-input border border-input bg-surface px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {TEAM_ACCESS_LEVELS.map((value) => (
                  <option key={value} value={value}>
                    {t(`accessLevel.${value}`)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t('accessHint')}</p>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <MailPlus aria-hidden />
              )}
              {submitting ? t('sending') : t('sendInvitation')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
