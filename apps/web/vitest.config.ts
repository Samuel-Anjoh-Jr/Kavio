import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Unit tests for the web app's PURE modules — presentation maths, contract
 * mappers, anything that can be wrong without a browser being involved.
 *
 * Deliberately no jsdom and no component renderer: this project's UI logic is
 * kept in plain functions (lib/trust.ts) precisely so it can be tested without
 * dragging a DOM implementation into CI. When a component genuinely needs
 * rendering coverage, that is the moment to add jsdom — not before.
 */
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.test.ts'],
      // Floors set just under the measured baseline so coverage can only ratchet up.
      thresholds: { statements: 22, lines: 22, functions: 15, branches: 30 },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
