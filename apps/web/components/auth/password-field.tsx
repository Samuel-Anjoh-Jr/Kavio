'use client';

import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * A password `Field` with a reveal toggle (NFR-A11Y-01) — every auth page's
 * password input goes through this rather than a plain `type="password"`
 * `Field`, since a typo nobody can see is a common reason a sign-up or login
 * fails on a phone keyboard.
 *
 * Not built by wrapping `Field`: the toggle sits INSIDE the input's own box
 * (so it lines up with the text, not below the whole labelled block), which
 * means the input/hint/error markup has to be assembled here directly.
 */
export function PasswordField({
  label,
  error,
  hint,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & {
  label: string;
  error?: string;
  hint?: ReactNode;
}) {
  const t = useTranslations('Auth');
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(error && errorId, hint && hintId) || undefined}
          className={cn('pr-11', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? t('hidePassword') : t('showPassword')}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-input text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
