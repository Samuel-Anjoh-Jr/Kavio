'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError } from '@/lib/api-error';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { restPost } from '@/lib/rest-api';
import { cn } from '@/lib/utils';

/**
 * Sign-up (ACC-04). Captures role INTENT in plain language rather than a role
 * name — "find work" / "hire someone" is what a non-technical visitor in Douala
 * actually recognises; the API maps it to WORKER / CLIENT.
 */
const schema = z
  .object({
    roleIntent: z.enum(['find_work', 'hire']),
    phone: z.string().trim().min(1),
    email: z.string().trim().email().optional().or(z.literal('')),
    password: z.string().min(8),
    // Honeypot. Real users never see it; bots fill it (SRS §18).
    website: z.string().max(0).optional(),
  })
  .strict();

type FormValues = z.infer<typeof schema>;

interface SignUpResponse {
  userId: string;
  phone: string;
  role: string;
}

export function SignUpForm({ defaultIntent }: { defaultIntent: 'find_work' | 'hire' }) {
  const t = useTranslations('Auth.signUp');
  const tShared = useTranslations('Auth');
  const translateError = useAuthErrorMessage();
  const router = useRouter();
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { roleIntent: defaultIntent, phone: '', email: '', password: '', website: '' },
  });

  const roleIntent = useWatch({ control, name: 'roleIntent' });

  async function onSubmit(values: FormValues) {
    setBanner(null);

    try {
      await restPost<SignUpResponse>('auth/signup', {
        roleIntent: values.roleIntent,
        phone: values.phone,
        // An empty optional must be omitted, not sent as "" — the API's email
        // validator would reject the empty string as malformed.
        ...(values.email ? { email: values.email } : {}),
        password: values.password,
        website: values.website,
      });

      // Ask for the verification code immediately, so the next screen already
      // has one in flight rather than making the user press "send".
      await restPost('auth/otp/request', {
        identifier: values.email || values.phone,
        purpose: 'PHONE_VERIFICATION',
      });

      router.push(
        `/auth/verify?identifier=${encodeURIComponent(values.email || values.phone)}&purpose=PHONE_VERIFICATION`,
      );
    } catch (error) {
      // Field-level errors from the typed contract land on the field itself;
      // anything else becomes the form banner. Never a silent failure.
      if (error instanceof ApiError && error.fields) {
        for (const [field, messages] of Object.entries(error.fields)) {
          if (field in schema.shape && messages[0]) {
            setError(field as keyof FormValues, { message: messages[0] });
          }
        }
      }
      setBanner({
        message: translateError(error),
        requestId: error instanceof ApiError ? error.requestId : undefined,
      });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
      {banner && <FormBanner tone="error" message={banner.message} requestId={banner.requestId} />}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-medium text-foreground">{t('intentLegend')}</legend>
        <div className="grid grid-cols-2 gap-3">
          {(['find_work', 'hire'] as const).map((intent) => (
            <button
              key={intent}
              type="button"
              onClick={() => setValue('roleIntent', intent, { shouldValidate: true })}
              aria-pressed={roleIntent === intent}
              className={cn(
                'rounded-card border px-4 py-4 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                roleIntent === intent
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-input bg-surface text-muted-foreground hover:bg-muted',
              )}
            >
              <span className="block font-medium text-foreground">
                {t(`intent.${intent}.title`)}
              </span>
              <span className="mt-1 block text-xs">{t(`intent.${intent}.description`)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <Field
        label={t('phoneLabel')}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+237 6XX XX XX XX"
        hint={t('phoneHint')}
        error={errors.phone?.message && t('phoneInvalid')}
        {...register('phone')}
      />

      <Field
        label={t('emailLabel')}
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        // Email is optional in the schema but is the ONLY channel that delivers
        // at launch (SMS deferred), so the hint says so rather than hiding it.
        hint={t('emailHint')}
        error={errors.email?.message && t('emailInvalid')}
        {...register('email')}
      />

      <Field
        label={t('passwordLabel')}
        type="password"
        autoComplete="new-password"
        hint={t('passwordHint')}
        error={errors.password?.message && t('passwordInvalid')}
        {...register('password')}
      />

      {/* Honeypot: hidden from users and assistive tech, visible to bots. */}
      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
      </div>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t('haveAccount')}{' '}
        <Link href="/auth/login" className="font-medium text-primary hover:underline">
          {tShared('signIn')}
        </Link>
      </p>
    </form>
  );
}
