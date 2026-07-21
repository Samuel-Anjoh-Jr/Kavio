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
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
