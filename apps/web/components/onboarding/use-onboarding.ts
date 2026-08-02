'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api-error';
import { restPatch, restPost } from '@/lib/rest-api';
import type { OnboardingRole, OnboardingState } from '@/lib/onboarding';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Autosave + resume for one onboarding flow (ACC-10).
 *
 * Saves are DEBOUNCED and the latest pending payload wins: users on a slow
 * Cameroonian mobile connection would otherwise fire a request per keystroke and
 * race their own answers into the wrong order. A save in flight does not block a
 * newer one being queued — it supersedes it.
 *
 * The server owns `completionPercent` and `currentStep`; every save returns the
 * recomputed state and that is what the UI renders. `data` itself is merged
 * rather than replaced wholesale: `state.data` only ever moves forward (each
 * keystroke advances it optimistically, synchronously), so a slow response for
 * an OLDER snapshot must never overwrite a field the user has since typed past
 * — that would show as the input snapping back to a stale value mid-type.
 */
const DEBOUNCE_MS = 700;

export function useOnboarding(role: OnboardingRole, initial: OnboardingState) {
  const [state, setState] = useState<OnboardingState>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<ApiError | Error | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<{ step: string; data: Record<string, unknown> } | null>(null);
  const inFlight = useRef(false);
  /** Resolves once the drain loop below finishes — shared so a caller that
   * arrives while a flush is already running (e.g. "Finish setup" clicked a
   * moment after the debounce fired) can await the SAME drain instead of
   * racing it. */
  const flushDone = useRef<Promise<void>>(Promise.resolve());
  /** Set when the drain loop stops on a failed save, so callers can tell a
   * "nothing queued" state apart from a "queued item was dropped after
   * failing" state — `queued.current` is cleared before the request that can
   * fail, so it cannot be used for that by itself. */
  const failed = useRef(false);

  /**
   * Drains the queue in a loop rather than by re-entering itself: anything the
   * user types while a save is in flight is picked up by the next iteration, so
   * the most recent edit always reaches the server without recursion.
   */
  const flush = useCallback((): Promise<void> => {
    if (inFlight.current) return flushDone.current;
    inFlight.current = true;

    flushDone.current = (async () => {
      try {
        while (queued.current) {
          const pending = queued.current;
          queued.current = null;

          setStatus('saving');
          setError(null);

          try {
            const next = await restPatch<OnboardingState>(
              `onboarding/${role.toLowerCase()}/step`,
              pending,
            );
            // Server-owned fields (completionPercent, currentStep, ...) come
            // from `next`; `data` merges with local state winning, since local
            // state can only have moved forward since `pending` was captured.
            setState((current) => ({ ...next, data: { ...next.data, ...current.data } }));
            setStatus('saved');
            failed.current = false;
          } catch (err) {
            setError(err instanceof Error ? err : new Error('SAVE_FAILED'));
            setStatus('error');
            failed.current = true;
            // Stop draining on failure — retrying the rest immediately would just
            // fail the same way and bury the error the user needs to see.
            break;
          }
        }
      } finally {
        inFlight.current = false;
      }
    })();

    return flushDone.current;
  }, [role]);

  const save = useCallback(
    (step: string, data: Record<string, unknown>) => {
      queued.current = { step, data };
      setStatus('saving');
      // Cleared here, not just at the start of `flush()`: a failed save on one
      // step must not leave its red banner showing over the NEXT thing the
      // user types, on this step or another, while the fresh edit is still
      // only queued and hasn't had a chance to succeed or fail on its own.
      setError(null);

      // Optimistic: the field this came from is a controlled input reading
      // straight out of `state.data`. Without updating it here, every
      // keystroke would redraw the input from the value BEFORE that keystroke
      // until the debounced save round-trips — long enough on a slow
      // connection for React to visibly snap the field back mid-type and eat
      // whatever was typed next. The server's response still wins once it
      // arrives; this just keeps typing responsive in the meantime.
      setState((current) => ({ ...current, data: { ...current.data, ...data } }));

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [flush],
  );

  /** Saves immediately — used when leaving a step, where a debounce could lose it. */
  const saveNow = useCallback(
    async (step: string, data: Record<string, unknown>) => {
      if (timer.current) clearTimeout(timer.current);
      queued.current = { step, data };
      await flush();
    },
    [flush],
  );

  const complete = useCallback(async (): Promise<OnboardingState | null> => {
    // A pending debounce, or a save already in flight, must land before we
    // ask the server to complete — otherwise the very field the user just
    // finished typing before pressing "Finish setup" is submitted as whatever
    // was last persisted, not what is on screen.
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await flush();

    if (failed.current) {
      // The error banner from that failed save is already showing; completing
      // against data older than the failed edit would silently drop it.
      return null;
    }

    setError(null);
    try {
      const next = await restPost<OnboardingState>(`onboarding/${role.toLowerCase()}/complete`);
      setState(next);
      setStatus('saved');
      return next;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('COMPLETE_FAILED'));
      setStatus('error');
      return null;
    }
  }, [role, flush]);

  // A pending debounce must not die with the component — otherwise navigating
  // away one keystroke after typing silently discards it.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (queued.current) void flush();
    };
  }, [flush]);

  return { state, status, error, save, saveNow, complete };
}
