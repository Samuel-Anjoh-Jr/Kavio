'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * Wraps next-themes: class-based dark mode (matches the `.dark` selector in
 * globals.css), synced to system preference by default. next-themes injects
 * its own blocking script that reads localStorage and sets the class before
 * paint, so there is no light-mode flash on load.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem {...props}>
      {children}
    </NextThemesProvider>
  );
}
