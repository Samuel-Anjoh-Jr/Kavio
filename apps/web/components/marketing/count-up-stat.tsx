'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useFormatter } from 'next-intl';
import { countUp } from '@/lib/motion';

export type CountUpFormat = 'integer' | 'currency' | 'decimal1';

/**
 * A social-proof count-up (SRS §20.6).
 *
 * The final value is ALSO rendered on the server into `children`, and stays
 * there until the element scrolls into view. That ordering matters: the real
 * number is in the HTML for a crawler and for anyone with JS disabled, so the
 * animation is a genuine enhancement rather than the only way to read the page.
 *
 * Formatting happens here through next-intl rather than being passed in as a
 * callback — a function cannot cross the server/client boundary, and doing the
 * maths inline in the animation callback is how a "15,000+" turns into
 * "15000.0000001" for one frame. `format` names a STYLE; the locale comes from
 * the ambient provider, so FR renders "15 000" and EN "15,000" with no branching
 * at the call site (SYS-03).
 */
export function CountUpStat({
  to,
  format = 'integer',
  children,
}: {
  to: number;
  format?: CountUpFormat;
  /** The server-rendered final value. */
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const formatter = useFormatter();

  const render = useCallback(
    (value: number) => {
      if (format === 'currency') return formatter.number(Math.round(value), 'currency');
      if (format === 'decimal1') return formatter.number(value, { maximumFractionDigits: 1 });
      return formatter.number(Math.round(value));
    },
    [format, formatter],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        countUp(el, { to, duration: 1_400, format: render });
      },
      { threshold: 0.5 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [to, render]);

  return <span ref={ref}>{children}</span>;
}
