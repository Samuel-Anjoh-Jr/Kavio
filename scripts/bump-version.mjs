#!/usr/bin/env node
// Single source of truth for the app version: the ROOT package.json.
// Writes the same version into apps/api, apps/mobile and apps/web.
// The Android build (apps/mobile/android/app/build.gradle) reads
// apps/mobile/package.json; the iOS build gets it from the release workflow.
//
// Usage:
//   node scripts/bump-version.mjs patch   # 0.1.0 -> 0.1.1  (fixes, small tweaks)
//   node scripts/bump-version.mjs minor   # 0.1.0 -> 0.2.0  (new features)
//   node scripts/bump-version.mjs major   # 0.1.0 -> 1.0.0  (big/breaking changes)
//   node scripts/bump-version.mjs 1.4.2   # set an exact version
//   node scripts/bump-version.mjs sync    # copy root version to the apps only
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPS = ['apps/api', 'apps/mobile', 'apps/web'];
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const write = (p, data) => writeFileSync(join(root, p), JSON.stringify(data, null, 2) + '\n');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: bump-version.mjs <patch|minor|major|sync|X.Y.Z>');
  process.exit(1);
}

const rootPkg = read('package.json');
const current = rootPkg.version;
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!m) throw new Error(`Root package.json version "${current}" is not X.Y.Z`);
const [maj, min, pat] = m.slice(1).map(Number);

let next;
if (arg === 'patch') next = `${maj}.${min}.${pat + 1}`;
else if (arg === 'minor') next = `${maj}.${min + 1}.0`;
else if (arg === 'major') next = `${maj + 1}.0.0`;
else if (arg === 'sync') next = current;
else if (/^v?\d+\.\d+\.\d+$/.test(arg)) next = arg.replace(/^v/, '');
else throw new Error(`Unknown argument "${arg}"`);

const [, nMin, nPat] = next.split('.').map(Number);
if (nMin > 99 || nPat > 99) {
  // Android versionCode = MAJOR*10000 + MINOR*100 + PATCH
  throw new Error(`Minor and patch must be <= 99 (got ${next}); bump the next part instead.`);
}

rootPkg.version = next;
write('package.json', rootPkg);
for (const app of APPS) {
  const p = `${app}/package.json`;
  const pkg = read(p);
  pkg.version = next;
  write(p, pkg);
}
console.log(`${current} -> ${next} (root, ${APPS.join(', ')})`);
