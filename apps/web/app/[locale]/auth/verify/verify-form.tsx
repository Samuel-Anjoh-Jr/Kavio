'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import { ResendCountdown } from '@/components/auth/resend-countdown';
import { useRouter } from '@/i18n/navigation';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import {
  PHONE_OTP_AVAILABLE_QUERY,
  type OtpPhoneChannelAvailableQueryResult,
} from '@/lib/graphql/auth';
import { peekIntent, safeReturnTo } from '@/lib/intent';
import { restPost } from '@/lib/rest-api';

interface OtpIssueResult {
  destination: string;
  expiresAt: string;
  resendAvailableAt: string;
  attemptsAllowed: number;
}

/**
 * OTP entry (ACC-04). One 6-digit field rather than six boxes: on a low-end
 * Android keyboard, split inputs fight autofill and paste, and the SMS/email
 * code arrives as one string anyway.
 */
export function VerifyForm({
  initialIdentifier,
  purpose,
  next,
}: {
  initialIdentifier: string;
  purpose: 'PHONE_VERIFICATION' | 'LOGIN';
  next: string | null;
}) {
  const t = useTranslations('Auth.verify');
  const tResend = useTranslations('Auth.resend');
  const translateError = useAuthErrorMessage();
  const router = useRouter();

  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [code, setCode] = useState('');
  const [issue, setIssue] = useState<OtpIssueResult | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Undefined while loading defaults to "unavailable" — the safe assumption,
  // matching the login screen's identifier field (ACC-04).
  const { data: channelData } = useQuery<OtpPhoneChannelAvailableQueryResult>(
    PHONE_OTP_AVAILABLE_QUERY,
    { fetchPolicy: 'cache-first' },
  );
  const phoneOtpAvailable = channelData?.otpPhoneChannelAvailable ?? false;
  // Only the LOGIN "sign in with a code" flow needs a channel-aware ask here —
  // PHONE_VERIFICATION always arrives with the identifier already known from
  // sign-up, so this branch never renders for it in practice.
  const emailOnly = purpose === 'LOGIN' && !phoneOtpAvailable;

  const requestCode = useCallback(
    async (target: string) => {
      if (!target) return;
      setPending(true);
      setBanner(null);

      try {
        const result = await restPost<OtpIssueResult>('auth/otp/request', {
          identifier: target,
          purpose,
        });
        setIssue(result);
        setBanner({
          tone: 'success',
          message: tResend('sentTo', { destination: result.destination }),
        });
      } catch (error) {
        setBanner({ tone: 'error', message: translateError(error) });
      } finally {
        setPending(false);
      }
    },
    [purpose, tResend, translateError],
  );

  // Auto-request once when we arrived with an identifier already known (the
  // sign-up flow). Guarded by a ref so React strict-mode's double effect does
  // not burn two codes against the per-user resend cooldown.
  const autoRequested = useRef(false);
  useEffect(() => {
    if (autoRequested.current || !initialIdentifier || purpose !== 'LOGIN') return;
    autoRequested.current = true;
    void requestCode(initialIdentifier);
  }, [initialIdentifier, purpose, requestCode]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setBanner(null);

    // Users paste codes with spaces; strip before sending rather than failing
    // the digits-only server validation.
    const cleaned = code.replace(/\D/g, '');

    const result = await signIn('otp', {
      identifier,
      code: cleaned,
      purpose,
      redirect: false,
    });

    setSubmitting(false);

    if (result?.error) {
      setBanner({ tone: 'error', message: translateError(result.code ?? 'INVALID_CODE') });
      return;
    }

    const pendingIntent = peekIntent();
    router.push(safeReturnTo(pendingIntent?.returnTo ?? next, '/app'));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      {banner && <FormBanner tone={banner.tone} message={banner.message} />}

      {/* Editable when we arrived without one — e.g. "sign in with a code".
          Restricted to email while neither SMS nor WhatsApp is live: a phone
          number typed here could never receive the code (ACC-04). */}
      {!initialIdentifier && (
        <Field
          label={emailOnly ? t('identifierLabelEmail') : t('identifierLabel')}
          type={emailOnly ? 'email' : 'text'}
          inputMode="email"
          autoComplete="username"
          placeholder={emailOnly ? t('identifierPlaceholderEmail') : undefined}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
        />
      )}

      <Field
        label={t('codeLabel')}
        type="text"
        inputMode="numeric"
        // Lets the browser / Android fill the code straight from the message.
        autoComplete="one-time-code"
        maxLength={10}
        placeholder="123456"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        hint={
          issue
            ? t('sentHint', { destination: issue.destination })
            : initialIdentifier
              ? t('sentHint', { destination: initialIdentifier })
              : t('codeHint')
        }
      />

      <Button type="submit" size="lg" disabled={submitting || code.trim().length === 0}>
        {submitting ? t('submitting') : t('submit')}
      </Button>

      <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
        <span>{t('noCode')}</span>
        <ResendCountdown
          availableAt={issue?.resendAvailableAt ?? null}
          pending={pending}
          onResend={() => void requestCode(identifier)}
        />
      </div>
    </form>
  );
}
