'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Window-scroll list virtualisation (DIS-11).
 *
 * Virtualises against the PAGE scroll rather than an inner scroll container, on
 * purpose. A nested scroller on a phone breaks pull-to-refresh, fights the
 * browser's URL-bar hiding, and traps momentum scrolling — and this list is the
 * main content of the screen, so it should scroll the way the screen does.
 *
 * Written by hand rather than pulled from a virtualisation library: the whole
 * behaviour is forty lines of arithmetic, and the alternative is shipping a
 * dependency to phones on 3G to save them.
 */

export interface WindowVirtualOptions {
  itemCount: number;
  /** Items per row at the current breakpoint — the grid virtualises by ROW. */
  columns: number;
  /** Estimated row height in px, including the gap below it. */
  rowHeight: number;
  /** Rows rendered beyond the viewport, so fast scrolling does not hit blanks. */
  overscanRows?: number;
  /**
   * Below this many items, virtualisation is skipped entirely. Spacer divs and
   * scroll listeners cost more than rendering thirty cards ever would.
   */
  threshold?: number;
}

export interface WindowVirtualResult {
  containerRef: RefObject<HTMLDivElement | null>;
  /** First item index to render (inclusive). */
  start: number;
  /** Last item index to render (exclusive). */
  end: number;
  /** Spacer heights that keep the scrollbar honest about the full list. */
  paddingTop: number;
  paddingBottom: number;
}

export function useWindowVirtual({
  itemCount,
  columns,
  rowHeight,
  overscanRows = 2,
  threshold = 30,
}: WindowVirtualOptions): WindowVirtualResult {
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * The visible ROW window. Rows rather than items so the state does not change
   * when only the column count does, and `null` until the first measurement so
   * the initial render can show the top of the list without guessing.
   */
  const [rows, setRows] = useState<{ startRow: number; endRow: number } | null>(null);

  const active = itemCount > threshold;

  useEffect(() => {
    if (!active) return;

    let frame = 0;

    const recompute = () => {
      const container = containerRef.current;
      if (!container) return;

      const rowCount = Math.ceil(itemCount / columns);
      // getBoundingClientRect rather than offsetTop: it accounts for every
      // ancestor's transform, and the app shell animates page transitions.
      const containerTop = container.getBoundingClientRect().top + window.scrollY;
      const scrolledIntoList = window.scrollY - containerTop;

      const firstVisibleRow = Math.floor(scrolledIntoList / rowHeight);
      const visibleRows = Math.ceil(window.innerHeight / rowHeight);

      setRows({
        startRow: Math.max(0, firstVisibleRow - overscanRows),
        endRow: Math.min(rowCount, firstVisibleRow + visibleRows + overscanRows),
      });
    };

    // Coalesced into one frame: scroll fires far more often than the browser
    // paints, and recomputing per event is how a list drops below 60fps.
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        recompute();
      });
    };

    // The first measurement is deferred to the next frame rather than run in
    // the effect body: it needs post-layout geometry to be meaningful, and a
    // synchronous state write here would cascade an extra render before paint.
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      recompute();
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [active, itemCount, columns, rowHeight, overscanRows]);

  // Below the threshold, or before the first measurement lands, the whole list
  // renders. That is the correct fallback in both cases: a short list costs
  // nothing, and a first paint showing everything is right at scroll position
  // zero and corrected one frame later at any other.
  if (!active || !rows) {
    return { containerRef, start: 0, end: itemCount, paddingTop: 0, paddingBottom: 0 };
  }

  const rowCount = Math.ceil(itemCount / columns);

  return {
    containerRef,
    start: rows.startRow * columns,
    end: Math.min(itemCount, rows.endRow * columns),
    paddingTop: rows.startRow * rowHeight,
    paddingBottom: Math.max(0, (rowCount - rows.endRow) * rowHeight),
  };
}
