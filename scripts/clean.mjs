#!/usr/bin/env node
// Removes installed deps and build/cache output across the workspace.
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const targets = [
  'node_modules',
  '.turbo',
  'apps/web/node_modules',
  'apps/web/.next',
  'apps/web/.turbo',
  'apps/api/node_modules',
  'apps/api/dist',
  'apps/api/.turbo',
  'apps/api/coverage',
  'packages/typescript-config/node_modules',
  'packages/database/node_modules',
  'packages/database/dist',
  'packages/api-client/node_modules',
  'packages/api-client/dist',
];

for (const target of targets) {
  const path = join(root, target);
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
    console.log(`[clean] removed ${target}`);
  }
}
