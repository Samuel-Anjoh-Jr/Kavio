'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, MailPlus, ShieldPlus, X } from 'lucide-react';
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
import { formatDate } from '@/lib/datetime';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { AGENT_INVITATION_TONE, inviteAgent, revokeAgentInvitation } from '@/lib/admin';
import {
  ADMIN_AGENT_INVITATIONS_QUERY,
  type AdminAgentInvitationsQueryResult,
} from '@/lib/graphql/admin';

/**
 * Agent invitations (ADM-06, meeting notes: admins invite agents).
 *
 * Agents cannot self-register, and this screen is the reason. A field agent
 * physically verifies workers — the capability that turns an unverified stranger
 * into a Tier 3 professional — so the only way one comes into existence is an
 * admin issuing an invitation here.
 *
 * The raw token is never shown, not even once: it goes to the invitee through
 * the notification dispatcher, and a token rendered into an admin's browser
 * history is a credential in a log file.
 */
export function AgentInvitations() {
  const t = useTranslations('Admin');
  const locale = useLocale();

  const { data, loading, error, refetch } = useQuery<AdminAgentInvitationsQueryResult>(
    ADMIN_AGENT_INVITATIONS_QUERY,
    { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
  );

  const invitations = data?.adminAgentInvitations ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('agentsCaption')}</p>
        <InviteAgentDialog onInvited={() => void refetch()} />
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-20 w-full rounded-card" />
        </div>
      ) : error && invitations.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
          {t('loadError')}
        </p>
      ) : invitations.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-14 text-center">
          <ShieldPlus aria-hidden className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t('noInvitations')}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t('noInvitationsBody')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {invitations.map((invitation) => (
            <InvitationRow
              key={invitation.id}
              invitation={invitation}
              locale={locale}
              onChanged={() => void refetch()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function InvitationRow({
  invitation,
  locale,
  onChanged,
}: {
  invitation: AdminAgentInvitationsQueryResult['adminAgentInvitations'][number];
  locale: string;
  onChanged: () => void;
}) {
  const t = useTranslations('Admin');
  const translateError = useAuthErrorMessage();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setWorking(true);
    setError(null);
    try {
      await revokeAgentInvitation(invitation.id);
      onChanged();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <li className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{invitation.name}</span>
            <StatusBadge
              tone={AGENT_INVITATION_TONE[invitation.status] ?? 'neutral'}
              size="sm"
              label={t(`invitationStatus.${invitation.status}`)}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {invitation.email}
            {invitation.phone ? ` · ${invitation.phone}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('invitedByOn', {
              name: invitation.invitedByName ?? t('unnamed'),
              date: formatDate(invitation.createdAt, locale) ?? '',
            })}
            {invitation.status === 'PENDING'
              ? ` · ${t('invitationExpires', { date: formatDate(invitation.expiresAt, locale) ?? '' })}`
              : ''}
            {invitation.acceptedAt
              ? ` · ${t('acceptedOn', { date: formatDate(invitation.acceptedAt, locale) ?? '' })}`
              : ''}
          </p>
          {invitation.note && (
            <p className="mt-1 text-xs text-muted-foreground italic">{invitation.note}</p>
          )}
        </div>

        {invitation.status === 'PENDING' && (
          <Button variant="ghost" size="sm" disabled={working} onClick={() => void revoke()}>
            {working ? <Loader2 aria-hidden className="animate-spin" /> : <X aria-hidden />}
            {t('revoke')}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

function InviteAgentDialog({ onInvited }: { onInvited: () => void }) {
  const t = useTranslations('Admin');
  const translateError = useAuthErrorMessage();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await inviteAgent({
        name: name.trim(),
        email: email.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setOpen(false);
      setName('');
      setEmail('');
      setPhone('');
      setNote('');
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
          <ShieldPlus aria-hidden />
          {t('inviteAgent')}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('inviteAgentTitle')}</DialogTitle>
          <DialogDescription>{t('inviteAgentSubtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-name">{t('agentNameLabel')}</Label>
            <Input
              id="agent-name"
              value={name}
              required
              minLength={2}
              maxLength={120}
              disabled={submitting}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-email">{t('agentEmailLabel')}</Label>
            <Input
              id="agent-email"
              type="email"
              value={email}
              required
              disabled={submitting}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-phone">{t('agentPhoneLabel')}</Label>
            <Input
              id="agent-phone"
              type="tel"
              inputMode="tel"
              placeholder="+237…"
              value={phone}
              disabled={submitting}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-note">{t('agentNoteLabel')}</Label>
            <Input
              id="agent-note"
              value={note}
              maxLength={500}
              placeholder={t('agentNotePlaceholder')}
              disabled={submitting}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <p className="text-xs text-muted-foreground">{t('inviteAgentWarning')}</p>

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
