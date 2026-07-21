'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * A labelled input with inline, field-level validation feedback (engineering
 * standard: no silent failures).
 *
 * `aria-invalid` + `aria-describedby` are wired here rather than at each call
 * site so a screen reader announces the error with the field every time, not
 * only where a developer remembered to.
 */
export function Field({
  label,
  error,
  hint,
  className,
  ...props
}: ComponentProps<'input'> & { label: string; error?: string; hint?: ReactNode }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(error && errorId, hint && hintId) || undefined}
        className={className}
        {...props}
      />
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
