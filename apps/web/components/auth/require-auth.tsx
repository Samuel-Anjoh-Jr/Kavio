'use client';

import { useCallback, useEffect, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { captureIntent, consumeIntent, type GatedAction, type GatedIntent } from '@/lib/intent';

/**
 * The reusable gate for every state-changing action (ACC-02).
 *
 * Guests browse freely (ACC-01); only the ACTION is gated. This hook is the one
 * place that decides what happens when a guest takes one, so no surface can
 * accidentally invent its own (worse) version.
 */
export function useRequireAuth() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    (
      action: GatedAction,
      run?: () => void,
      options?: { payload?: Record<string, unknown>; returnTo?: string },
    ): boolean => {
      if (status === 'authenticated') {
        run?.();
        return true;
      }

      // Still resolving the session — do nothing rather than bounce a signed-in
      // user to login on a slow first paint.
      if (status === 'loading') {
        return false;
      }

      const returnTo = options?.returnTo ?? pathname;
      captureIntent({ action, returnTo, payload: options?.payload });
      router.push(`/auth/login?next=${encodeURIComponent(returnTo)}&intent=${action}`);
      return false;
    },
    [status, router, pathname],
  );
}

/**
 * Replays a captured intent once its destination screen has mounted.
 *
 * The screen says which action it can handle; an intent for a different action
 * is left in place for whichever screen owns it.
 */
export function useIntentReplay(action: GatedAction, onReplay: (intent: GatedIntent) => void): void {
  useEffect(() => {
    const pending = consumeIntent();
    if (!pending) return;

    if (pending.action !== action) {
      // Not ours — put it back so the right screen still gets it.
      captureIntent(pending);
      return;
    }

    onReplay(pending);
    // Intentionally runs once on mount: replay is a one-shot handoff, and
    // re-running it when `onReplay` re-identifies would re-fire the action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);
}

/**
 * Wraps any trigger so a guest's click captures the intent and bounces to auth
 * instead of firing. Renders its child directly for signed-in users.
 */
export function GatedAction({
  action,
  onAction,
  payload,
  children,
}: {
  action: GatedAction;
  onAction: () => void;
  payload?: Record<string, unknown>;
  children: ReactNode;
}) {
  const requireAuth = useRequireAuth();

  return (
    <span
      onClickCapture={(event) => {
        // Capture phase: the gate must run BEFORE the child's own handler, or a
        // guest's click would fire the action and then redirect.
        if (!requireAuth(action, undefined, { payload })) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onAction();
      }}
      className="contents"
    >
      {children}
    </span>
  );
}
