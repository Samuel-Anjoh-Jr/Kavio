'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, Users } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { completeTeamInvitation } from '@/lib/business';

const MIN_PASSWORD_LENGTH = 10;

/**
 * Redeeming a business team invitation by email (BIZ-03).
 *
 * Unauthenticated by necessity — the invitee usually has no Kavio account yet,
 * which is the whole point of an emailed link. The token from the link IS the
 * authorisation.
 *
 * A password is required even though the link proves possession of the inbox:
 * the link can sit there indefinitely, and a business seat anyone who later
 * reads that inbox can claim is a credential left on a doormat.
 *
 * On success this sends them to login rather than signing them in, same
 * reasoning as the agent invite flow: minting a session straight from an
 * emailed token would make the link itself a live credential.
 */
export function TeamInviteAccept({ token }: { token: string | null }) {
  const t = useTranslations('BusinessConsole');
  const translateError = useAuthErrorMessage();
  const router = useRouter();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="rounded-card border border-border bg-surface p-6">
        <p className="font-medium text-foreground">{t('inviteLinkMissing')}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t('inviteLinkMissingBody')}</p>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (password !== confirm) {
      setError(t('passwordsDiffer'));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await completeTeamInvitation({
        token: token!,
        password,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      setDone(true);
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-success/30 bg-success/5 p-8 text-center">
        <CheckCircle2 aria-hidden className="size-8 text-success" />
        <p className="font-medium text-foreground">{t('teamInviteAcceptedTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('teamInviteAcceptedBody')}</p>
        <Button className="mt-2" onClick={() => router.push('/auth/login')}>
          {t('goToLogin')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-4">
        <Users aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">{t('teamInviteExplainer')}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accept-name">{t('teamInviteNameLabel')}</Label>
        <Input
          id="accept-name"
          value={name}
          maxLength={120}
          disabled={submitting}
          placeholder={t('teamInviteNamePlaceholder')}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accept-password">{t('passwordLabel')}</Label>
        <Input
          id="accept-password"
          type="password"
          value={password}
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          disabled={submitting}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {t('passwordHint', { min: MIN_PASSWORD_LENGTH })}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accept-confirm">{t('confirmPasswordLabel')}</Label>
        <Input
          id="accept-confirm"
          type="password"
          value={confirm}
          required
          autoComplete="new-password"
          disabled={submitting}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 aria-hidden className="animate-spin" />}
        {submitting ? t('creatingAccount') : t('createTeamAccount')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t('alreadyHaveAccount')}{' '}
        <Link href="/auth/login" className="text-primary underline-offset-4 hover:underline">
          {t('goToLogin')}
        </Link>
      </p>
    </form>
  );
}
