#!/usr/bin/env node
// Kills lingering Node/Bun processes and removes build/cache output (keeps node_modules).
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();

const targets = [
  '.turbo',
  'apps/web/.next',
  'apps/web/.turbo',
  'apps/api/dist',
  'apps/api/.turbo',
  'apps/api/coverage',
  'packages/database/dist',
  'packages/api-client/dist',
];

function killProcesses() {
  const isWindows = process.platform === 'win32';
  const commands = isWindows
    ? ['taskkill /F /IM node.exe /T', 'taskkill /F /IM bun.exe /T']
    : ['pkill -f node', 'pkill -f bun'];

  for (const cmd of commands) {
    try {
      execSync(cmd, { stdio: 'ignore' });
      console.log(`[clean] ran: ${cmd}`);
    } catch {
      // no matching process found; ignore
    }
  }
}

killProcesses();

for (const target of targets) {
  const path = join(root, target);
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
    console.log(`[clean] removed ${target}`);
  }
}
