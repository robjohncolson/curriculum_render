/**
 * ONE offline queue (sprint C2, 2026-10-22). follow-alongs/offline-queue.js is the
 * canonical copy; this repo's offline-queue.js is a byte-identical mirror written
 * by follow-alongs/scripts/sync-offline-queue.mjs. Never edit the mirror: edit
 * the follow-alongs file and run the sync. The shared behaviour suite
 * tests/offline-queue-unified.test.js is mirrored the same way.
 *
 * Skipped when the sibling follow-alongs checkout is absent (CI runners).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sibling = resolve(repo, '../follow-alongs');
const SYNCED_FILES = ['offline-queue.js', 'tests/offline-queue-unified.test.js'];

describe('offline-queue.js is a mirror of follow-alongs', () => {
  it('the mirror says where the canonical copy lives', () => {
    const src = readFileSync(resolve(repo, 'offline-queue.js'), 'utf8');
    expect(src).toContain('follow-alongs/offline-queue.js is the canonical copy');
    expect(src).toContain('scripts/sync-offline-queue.mjs');
  });

  it.skipIf(!existsSync(resolve(sibling, 'offline-queue.js')))(
    'follow-alongs copies are byte-identical (skipped when the sibling repo is absent)',
    () => {
      for (const file of SYNCED_FILES) {
        const ours = readFileSync(resolve(repo, file));
        const theirs = readFileSync(resolve(sibling, file));
        expect(ours.equals(theirs), `${file} drifted: run node scripts/sync-offline-queue.mjs in follow-alongs`).toBe(true);
      }
    }
  );
});
