import type React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Inline CSS custom properties (e.g. `--kv-delay`) typed for React's `style`
 * prop. Keeps stagger delays and per-element values next to the markup that
 * owns them instead of in one-off classes.
 */
export function cssVars(vars: Record<`--${string}`, string | number>): React.CSSProperties {
  return vars as React.CSSProperties;
}
