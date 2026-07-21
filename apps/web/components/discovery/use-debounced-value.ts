'use client';

import { useEffect, useState } from 'react';

/**
 * Debounces a value (DIS-04).
 *
 * Search is the most expensive public read in the system — trigram matching
 * plus a spatial join — and it runs while somebody types. 300 ms is the window
 * where a query fires once per word rather than once per keystroke, and it is
 * still under the threshold where typing starts to feel unresponsive.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
