#!/usr/bin/env node
// bump-build.mjs — bump the quiz app's build stamp so a stale, long-open quiz tab
// gets a "a new version is available — reload" nudge.
//
// Writes the SAME new stamp to BOTH:
//   - APP_BUILD in version-check.js   (the running build)
//   - version.json                    (the latest deployed build)
// They MUST stay in sync (a vitest pins build === APP_BUILD) — if version.json were
// ever AHEAD of version-check.js, every freshly-loaded quiz would nudge in a loop.
//
// Run before deploying a quiz-app change you want open tabs to pick up:
//   node scripts/bump-build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkPath = resolve(root, 'version-check.js');
const versionPath = resolve(root, 'version.json');
const swPath = resolve(root, 'sw.js');

const stamp = new Date().toISOString().slice(0, 10) + '-' + Date.now().toString(36).slice(-4);

let src = readFileSync(checkPath, 'utf8');
const re = /(var APP_BUILD = ')[^']*(';)/;
if (!re.test(src)) {
  console.error('ERROR: APP_BUILD marker not found in ' + checkPath);
  process.exit(1);
}
src = src.replace(re, `$1${stamp}$2`);
writeFileSync(checkPath, src);
writeFileSync(versionPath, JSON.stringify({ build: stamp, ts: Date.now() }) + '\n');

// Keep the PWA cache version in lockstep so a deploy purges the old SW cache.
let sw = readFileSync(swPath, 'utf8');
const swRe = /(const BUILD = ')[^']*(';)/;
if (!swRe.test(sw)) {
  console.error('ERROR: BUILD marker not found in ' + swPath);
  process.exit(1);
}
writeFileSync(swPath, sw.replace(swRe, `$1${stamp}$2`));

console.log('bumped quiz build -> ' + stamp);
console.log('  ' + checkPath);
console.log('  ' + versionPath);
console.log('  ' + swPath);
