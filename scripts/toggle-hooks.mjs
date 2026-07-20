#!/usr/bin/env node
// Disables/re-enables the Husky pre-commit hook without touching git config,
// so it works the same on every OS. Usage: node scripts/toggle-hooks.mjs <on|off>
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const mode = process.argv[2];
const huskyDir = join(process.cwd(), '.husky');
const active = join(huskyDir, 'pre-commit');
const disabled = join(huskyDir, 'pre-commit.disabled');

if (mode === 'off') {
  if (existsSync(active)) {
    renameSync(active, disabled);
    console.log('[hooks] pre-commit disabled. Run "pnpm hooks:enable" to restore it.');
  } else {
    console.log('[hooks] pre-commit is already disabled.');
  }
} else if (mode === 'on') {
  if (existsSync(disabled)) {
    renameSync(disabled, active);
    console.log('[hooks] pre-commit re-enabled.');
  } else {
    console.log('[hooks] pre-commit is already enabled.');
  }
} else {
  console.error('Usage: node scripts/toggle-hooks.mjs <on|off>');
  process.exit(1);
}
