'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { animate } from 'animejs';
import { ChevronDown } from 'lucide-react';
import { motionDuration, prefersReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * The reusable accordion primitive (SRS §26.2: "FAQ uses a smooth animated
 * accordion").
 *
 * Height IS animated here, and that is a deliberate, narrow exception to the
 * transform/opacity-only rule in the motion system. An accordion that does not
 * push the content below it is not an accordion — the whole affordance is
 * "this panel takes up space now". The exception is kept safe by construction:
 * the animation runs on a fixed pixel height for a bounded duration, then the
 * height is released back to `auto` so a resize or a font change reflows
 * naturally instead of being frozen at a stale measurement.
 *
 * ACCESSIBILITY is not decoration on this component. The header is a real
 * `<button>` (keyboard operable and focusable for free), wired to its panel with
 * `aria-expanded` and `aria-controls`, and the panel is `hidden` when closed so
 * a screen reader does not read collapsed answers as page content (NFR-A11Y-01).
 */
export interface AccordionItemProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function AccordionItem({
  title,
  children,
  defaultOpen = false,
  className,
}: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<SVGSVGElement>(null);
  // Skips the open/close animation on the very first render, so an item that
  // starts open does not animate itself in on page load.
  const mounted = useRef(false);
  const id = useId();

  const panelId = `${id}-panel`;
  const buttonId = `${id}-button`;

  useEffect(() => {
    const panel = panelRef.current;
    const chevron = chevronRef.current;
    if (!panel) return;

    if (!mounted.current) {
      mounted.current = true;
      panel.style.height = open ? 'auto' : '0px';
      if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
      return;
    }

    if (chevron) {
      animate(chevron, {
        rotate: open ? 180 : 0,
        duration: motionDuration(300),
        ease: 'outQuad',
      });
    }

    if (prefersReducedMotion()) {
      panel.style.height = open ? 'auto' : '0px';
      return;
    }

    // Measure the natural height before animating toward (or away from) it.
    const target = panel.scrollHeight;

    animate(panel, {
      height: open ? [0, target] : [target, 0],
      duration: motionDuration(320),
      ease: 'outQuad',
      onComplete: () => {
        // Releasing to `auto` is what keeps a reflow (rotation, text resize,
        // a lazily-loaded image inside the answer) from being clipped by a
        // height frozen at the moment the animation ran.
        panel.style.height = open ? 'auto' : '0px';
      },
    });
  }, [open]);

  const toggle = useCallback(() => setOpen((value) => !value), []);

  return (
    <div className={cn('border-b border-border', className)}>
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="flex w-full items-center justify-between gap-4 py-5 text-left font-heading text-base font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span>{title}</span>
          <ChevronDown
            ref={chevronRef}
            className="size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      </h3>

      <div
        ref={panelRef}
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        // `hidden` would fight the height animation, so visibility is expressed
        // by the animated height and `inert` keeps the collapsed panel out of
        // the tab order and the accessibility tree.
        inert={!open}
        className="overflow-hidden"
        style={{ height: 0 }}
      >
        <div className="pb-5 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/** Groups items and owns the shared border treatment. */
export function Accordion({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('border-t border-border', className)}>{children}</div>;
}
