'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import { PasswordField } from '@/components/auth/password-field';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { peekIntent, safeReturnTo } from '@/lib/intent';

const schema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
  website: z.string().max(0).optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Login (ACC-05, ACC-09) with intent resume (ACC-02).
 *
 * `next` is where a gated action bounced from. After a successful sign-in the
 * user goes back there — not to a generic home — so the action they were part
 * way through survives the detour.
 */
export function LoginForm({ next, gatedAction }: { next: string | null; gatedAction: string | null }) {
  const t = useTranslations('Auth.login');
  const tShared = useTranslations('Auth');
  const tGated = useTranslations('Auth.gated');
  const translateError = useAuthErrorMessage();
  const router = useRouter();
  const [banner, setBanner] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '', website: '' },
  });

  async function onSubmit(values: FormValues) {
    setBanner(null);

    const result = await signIn('password', {
      identifier: values.identifier,
      password: values.password,
      redirect: false,
    });

    if (result?.error) {
      // A second factor is not a failure — it is the next step. Routing it to
      // the 2FA screen instead of showing "invalid password" is the whole
      // reason the API distinguishes the two (ACC-09).
      if (result.code === 'TWO_FACTOR_REQUIRED') {
        router.push(
          `/auth/two-factor?identifier=${encodeURIComponent(values.identifier)}${
            next ? `&next=${encodeURIComponent(next)}` : ''
          }`,
        );
        return;
      }

      if (result.code === 'ACCOUNT_NOT_VERIFIED') {
        router.push(
          `/auth/verify?identifier=${encodeURIComponent(values.identifier)}&purpose=PHONE_VERIFICATION`,
        );
        return;
      }

      setBanner(translateError(result.code ?? 'INVALID_CREDENTIALS'));
      return;
    }

    // A captured intent's own returnTo wins over `next`: it is the more specific
    // record of what the user was actually doing.
    const pending = peekIntent();
    router.push(safeReturnTo(pending?.returnTo ?? next, '/app'));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
      {/* Explains WHY they were interrupted, so the bounce reads as intentional. */}
      {gatedAction && tGated.has(gatedAction) && (
        <FormBanner tone="success" message={tGated(gatedAction)} />
      )}

      {banner && <FormBanner tone="error" message={banner} />}

      <Field
        label={t('identifierLabel')}
        type="text"
        inputMode="email"
        autoComplete="username"
        placeholder={t('identifierPlaceholder')}
        error={errors.identifier?.message && t('identifierRequired')}
        {...register('identifier')}
      />

      <div className="flex flex-col gap-2">
        <PasswordField
          label={t('passwordLabel')}
          autoComplete="current-password"
          error={errors.password?.message && t('passwordRequired')}
          {...register('password')}
        />
        <Link
          href="/auth/forgot-password"
          className="self-end text-xs font-medium text-primary hover:underline"
        >
          {t('forgotPassword')}
        </Link>
      </div>

      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
      </div>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? t('submitting') : tShared('signIn')}
      </Button>

      {/* Passwordless path: phone-first users may never have set a password. */}
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={isSubmitting}
        onClick={() => {
          const identifier = getValues('identifier');
          router.push(
            `/auth/verify?purpose=LOGIN${identifier ? `&identifier=${encodeURIComponent(identifier)}` : ''}${
              next ? `&next=${encodeURIComponent(next)}` : ''
            }`,
          );
        }}
      >
        {t('useCode')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t('noAccount')}{' '}
        <Link href="/auth/signup" className="font-medium text-primary hover:underline">
          {t('createAccount')}
        </Link>
      </p>
    </form>
  );
}
