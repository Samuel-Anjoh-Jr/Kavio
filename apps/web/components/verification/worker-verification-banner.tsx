'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { BadgeCheck, Mail, Phone, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import { useRouter } from '@/i18n/navigation';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import {
  MY_DISCOVERY_STATUS_QUERY,
  type MyDiscoveryStatusQueryResult,
} from '@/lib/graphql/documents';
import { restPost } from '@/lib/rest-api';

/**
 * The worker's "your profile is not visible yet" banner (TRU-05).
 *
 * A worker whose contact is unverified is INVISIBLE in search — that is the
 * discovery gate working as designed, but from the worker's side an empty inbox
 * is indistinguishable from a quiet market. This banner is the difference: it
 * names the reason and does the next step in place.
 *
 * The contact step is handled inline rather than by sending the worker to a
 * separate screen. Requesting a code and typing it back are two halves of one
 * thought, and a page navigation between them is where people drop out. The ID
 * step does navigate, because uploading a document is a real task with its own
 * screen — pretending otherwise inside a banner would be worse.
 */
type Phase = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'verifying' };

export function WorkerVerificationBanner() {
  const t = useTranslations('WorkerVerificationBanner');
  const router = useRouter();
  const translateError = useAuthErrorMessage();

  const { data, refetch } = useQuery<MyDiscoveryStatusQueryResult>(MY_DISCOVERY_STATUS_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const status = data?.myDiscoveryStatus;

  // Nothing to say until the read lands, and nothing to say once the profile is
  // live — a permanent "you are verified" banner is just furniture.
  if (!status || status.discoverable) {
    return null;
  }

  async function sendCode() {
    if (!status?.otpDestination) return;
    setPhase({ kind: 'sending' });
    setError(null);
    setNotice(null);
    try {
      await restPost('auth/otp/request', {
        identifier: status.otpDestination,
        purpose: 'PHONE_VERIFICATION',
      });
      setPhase({ kind: 'sent' });
      setNotice(t('codeSent', { destination: status.otpDestination }));
    } catch (err) {
      setPhase({ kind: 'idle' });
      setError(translateError(err));
    }
  }

  async function submitCode() {
    if (!status?.otpDestination) return;
    setPhase({ kind: 'verifying' });
    setError(null);
    try {
      await restPost('auth/otp/verify', {
        identifier: status.otpDestination,
        purpose: 'PHONE_VERIFICATION',
        code: code.trim(),
      });
      setCode('');
      setNotice(null);
      // Re-read rather than assume: the banner's next state is the server's
      // answer, and the ID step may still be outstanding.
      await refetch();
      setPhase({ kind: 'idle' });
    } catch (err) {
      setPhase({ kind: 'sent' });
      setError(translateError(err));
    }
  }

  const ChannelIcon = status.otpChannel === 'PHONE' ? Phone : Mail;

  return (
    <section
      className="mt-8 rounded-card border border-warning/30 bg-warning/10 p-6"
      aria-labelledby="worker-verification-heading"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="flex w-full flex-col gap-1">
          <h2
            id="worker-verification-heading"
            className="font-heading text-lg font-semibold text-foreground"
          >
            {t('heading')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('body')}</p>
        </div>
      </div>

      {/* ── Step 1: prove a contact ──────────────────────────────────────── */}
      {!status.contactVerified && (
        <div className="mt-4">
          {phase.kind === 'idle' || phase.kind === 'sending' ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void sendCode()} disabled={phase.kind === 'sending'}>
                <ChannelIcon aria-hidden />
                {status.otpChannel === 'PHONE'
                  ? t('sendCodePhone', { destination: status.otpDestination ?? '' })
                  : t('sendCodeEmail', { destination: status.otpDestination ?? '' })}
              </Button>
              {!status.otpDestination && (
                <p className="text-sm text-muted-foreground">{t('noDestination')}</p>
              )}
            </div>
          ) : (
            // The button becomes the input in place: same box, next step.
            <div className="flex flex-col gap-3">
              <Field
                label={t('codeLabel')}
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t('codePlaceholder')}
                onChange={(event) => setCode(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => void submitCode()}
                  disabled={phase.kind === 'verifying' || code.trim().length === 0}
                >
                  {t('verify')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void sendCode()}
                  disabled={phase.kind === 'verifying'}
                >
                  {t('resend')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: prove an identity ────────────────────────────────────── */}
      {status.contactVerified && !status.idVerified && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <BadgeCheck aria-hidden className="size-5 text-success" />
          <p className="text-sm text-foreground">{t('contactDone')}</p>
          <Button onClick={() => router.push('/app/verification')}>{t('verifyIdCta')}</Button>
        </div>
      )}

      {notice && (
        <div className="mt-3">
          <FormBanner tone="success" message={notice} />
        </div>
      )}
      {error && (
        <div className="mt-3">
          <FormBanner tone="error" message={error} />
        </div>
      )}
    </section>
  );
}
