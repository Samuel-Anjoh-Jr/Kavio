import type * as React from 'react';
import type * as ToastPrimitive from '@radix-ui/react-toast';
import type { VariantProps } from 'class-variance-authority';
import type { toastVariants } from './toast';

export type ToastProps = React.ComponentProps<typeof ToastPrimitive.Root> &
  VariantProps<typeof toastVariants>;

export type ToastActionElement = React.ReactElement<typeof ToastPrimitive.Action>;
