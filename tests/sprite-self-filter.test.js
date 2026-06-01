// sprite-self-filter.test.js -- pins the case-robust self-filter in
// js/sprite_manager.js so the signed-in user never renders as a phantom "peer"
// sprite. Roster usernames are lowercase (apple_monkey) but cr normalizes
// currentUsername to Title_Case (Apple_Monkey); the old exact-match self-filter
// (u !== current) let self slip through. _isSelf compares normalized forms.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(resolve(repo, 'js/sprite_manager.js'), 'utf8');

function slice(marker, len = 400) {
  const i = SRC.indexOf(marker);
  return i === -1 ? '' : SRC.slice(i, i + len);
}

describe('sprite self-filter (case-robust)', () => {
  it('defines _isSelf with a normalized (lowercase) comparison of currentUsername', () => {
    const fn = slice('_isSelf(username)', 500);
    expect(fn).not.toBe('');
    expect(fn).toMatch(/toLowerCase\s*\(\s*\)/);
    expect(fn).toMatch(/currentUsername/);
    expect(fn).toMatch(/consensusUsername/); // fallback source
  });

  it('all three peer-sprite entry points filter self via _isSelf', () => {
    // presence-driven
    expect(slice('updateOnlinePeers(onlineUsernames)', 300)).toMatch(/!this\._isSelf\(/);
    // preload
    expect(slice('preloadPeers(usernames', 300)).toMatch(/!this\._isSelf\(/);
    // self-echo on answer broadcast
    expect(slice('handlePeerAnswer(username', 300)).toMatch(/this\._isSelf\(\s*username\s*\)/);
  });

  it('no longer relies on a bare exact-match self-filter (u !== current)', () => {
    expect(SRC).not.toMatch(/\bu\s*!==\s*current\b/);
  });
});
