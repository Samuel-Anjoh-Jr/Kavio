'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from '@/lib/motion';

// useLayoutEffect warns during server rendering; the effect is client-only
// anyway, so fall back to useEffect where there is no DOM.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Runs `enter` once, the first time `ref` scrolls into view.
 *
 * The server renders every animated element in its FINAL state, so a crawler,
 * a no-JS visitor and a reduced-motion user all get the finished page. On the
 * client, `prepare` resets the element to its starting state in a layout
 * effect (before paint, so the reset is never seen), and `enter` plays the
 * animation from there. Under prefers-reduced-motion neither runs: the final
 * state simply stays.
 *
 * Callbacks are read through refs, so callers can pass inline functions
 * without re-running the observer on every render.
 */
export function useInViewOnce<T extends Element>(
  ref: RefObject<T | null>,
  {
    prepare,
    enter,
    threshold = 0.25,
    rootMargin,
  }: {
    prepare?: (el: T) => void;
    enter: (el: T) => void;
    threshold?: number;
    rootMargin?: string;
  },
): void {
  const prepareRef = useRef(prepare);
  const enterRef = useRef(enter);

  useIsomorphicLayoutEffect(() => {
    prepareRef.current = prepare;
    enterRef.current = enter;
  });

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    prepareRef.current?.(el);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        enterRef.current(el);
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold, rootMargin]);
}
