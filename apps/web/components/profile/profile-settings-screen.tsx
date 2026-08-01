'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { ApiError } from '@/lib/api-error';
import { ME_QUERY, type MeQueryResult } from '@/lib/graphql/documents';
import { restPost } from '@/lib/rest-api';

/**
 * Name and phone number, editable independently of sign-up and onboarding.
 *
 * Phone stays a free edit for now (no OTP round trip) — SMS and WhatsApp are
 * both off, so there is no channel to prove a new number against; the API
 * enforces uniqueness and starts requiring re-verification the moment either
 * channel goes live, with no change needed here.
 */
export function ProfileSettingsScreen() {
  const t = useTranslations('ProfileSettings');
  const { data, loading } = useQuery<MeQueryResult>(ME_QUERY, {
    fetchPolicy: 'cache-and-network',
  });
  const me = data?.me;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
      </header>

      {loading && !me ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full rounded-card" />
          <Skeleton className="h-32 w-full rounded-card" />
        </div>
      ) : me ? (
        <>
          {/* Keyed to the loaded value so a genuinely different value from the
              server (a fresh load, not this component's own save) starts each
              section from the right place — never resynced afterward, so
              typing here behaves like the onboarding fields, not against them. */}
          <NameSection key={`name-${me.name ?? ''}`} initialName={me.name ?? ''} />
          <PhoneSection key={`phone-${me.phone ?? ''}`} initialPhone={me.phone ?? ''} />
        </>
      ) : null}
    </div>
  );
}

function NameSection({ initialName }: { initialName: string }) {
  const t = useTranslations('ProfileSettings');
  const translateError = useAuthErrorMessage();
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const trimmed = name.trim();
  const valid = trimmed.length >= 2;
  const unchanged = trimmed === initialName;

  async function save() {
    setStatus('saving');
    setError(null);
    try {
      await restPost<{ name: string }>('auth/profile', { name: trimmed });
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      setError({
        message: translateError(err),
        requestId: err instanceof ApiError ? err.requestId : undefined,
      });
    }
  }

  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="font-heading text-lg font-semibold text-foreground">{t('nameHeading')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('nameBody')}</p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label={t('nameLabel')}
            value={name}
            maxLength={160}
            onChange={(e) => {
              setName(e.target.value);
              setStatus('idle');
            }}
          />
        </div>
        <Button onClick={() => void save()} disabled={!valid || unchanged || status === 'saving'}>
          {status === 'saving' ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {t('save')}
        </Button>
      </div>

      {status === 'saved' && <p className="mt-2 text-sm text-success">{t('saved')}</p>}
      {error && (
        <div className="mt-3">
          <FormBanner tone="error" message={error.message} requestId={error.requestId} />
        </div>
      )}
    </section>
  );
}

function PhoneSection({ initialPhone }: { initialPhone: string }) {
  const t = useTranslations('ProfileSettings');
  const translateError = useAuthErrorMessage();
  const [phone, setPhone] = useState(initialPhone);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const trimmed = phone.trim();
  const unchanged = trimmed === initialPhone;

  async function save() {
    setStatus('saving');
    setError(null);
    try {
      await restPost<{ phone: string }>('auth/phone', { phone: trimmed });
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      setError({
        message: translateError(err),
        requestId: err instanceof ApiError ? err.requestId : undefined,
      });
    }
  }

  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="font-heading text-lg font-semibold text-foreground">{t('phoneHeading')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('phoneBody')}</p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label={t('phoneLabel')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="6XX XXX XXX"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setStatus('idle');
            }}
          />
        </div>
        <Button
          onClick={() => void save()}
          disabled={trimmed.length === 0 || unchanged || status === 'saving'}
        >
          {status === 'saving' ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {t('save')}
        </Button>
      </div>

      {status === 'saved' && <p className="mt-2 text-sm text-success">{t('saved')}</p>}
      {error && (
        <div className="mt-3">
          <FormBanner tone="error" message={error.message} requestId={error.requestId} />
        </div>
      )}
    </section>
  );
}
