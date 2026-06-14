/**
 * tests/u3-sprite-hue-loadtime.test.js
 *
 * The PlayerSprite constructor must resolve its hue from the SHARED roster
 * session (rosterClient.current().spriteHue) -- the same value the Desk's Live
 * Classroom board renders -- so the quiz avatar color is consistent across apps
 * and devices on any plain load (no re-sign-in). It falls back to the
 * device-local localStorage/IDB only when there is no roster session hue.
 *
 * Pure Node (cr tests are environment:'node'): load the real player_sprite.js
 * into a vm with stubbed window/localStorage and assert the resolved hue.
 * waitForStorage is intentionally left undefined so _loadHueFromIDB /
 * _saveHueToIDB early-return (no IDB needed in the harness).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const SRC = readFileSync(
  resolve(__dirname, '..', 'js/entities/player_sprite.js'),
  'utf8'
);

// Build a PlayerSprite in an isolated vm. rosterHue === undefined => no
// rosterClient at all; rosterHue === null => current() returns { spriteHue:null }.
function makeSprite({ rosterHue, localHue } = {}) {
  const localStore = new Map();
  if (localHue !== undefined && localHue !== null) {
    localStore.set('spriteColorHue', String(localHue));
  }

  const windowStub = { addEventListener() {}, removeEventListener() {} };
  if (rosterHue !== undefined) {
    windowStub.rosterClient = { current: () => ({ spriteHue: rosterHue }) };
  }

  const sandbox = {
    window: windowStub,
    localStorage: {
      getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
      setItem: (k, v) => localStore.set(k, String(v)),
    },
    console,
  };

  const ctx = createContext(sandbox);
  runInContext(SRC + '\nthis.__PlayerSprite = PlayerSprite;', ctx);
  const stubSheet = { frameWidth: 80, frameHeight: 96 };
  const sprite = new sandbox.__PlayerSprite(stubSheet, 0, 0);
  return { sprite, localStore };
}

describe('PlayerSprite hue -- prefers the shared roster session (cross-app)', () => {
  it('uses rosterClient.current().spriteHue over a stale local value', () => {
    const { sprite } = makeSprite({ rosterHue: 200, localHue: 50 });
    expect(sprite.hue).toBe(200);
  });

  it('seeds localStorage from the roster hue so the async IDB load cannot clobber it', () => {
    const { sprite, localStore } = makeSprite({ rosterHue: 145, localHue: null });
    expect(sprite.hue).toBe(145);
    expect(localStore.get('spriteColorHue')).toBe('145');
  });

  it('honors a roster hue of 0 (no rotation = base sprite) -- 0 is a valid pick', () => {
    const { sprite } = makeSprite({ rosterHue: 0, localHue: 270 });
    expect(sprite.hue).toBe(0);
  });

  it('falls back to localStorage when there is no roster session', () => {
    const { sprite } = makeSprite({ localHue: 88 });
    expect(sprite.hue).toBe(88);
  });

  it('falls back to localStorage when roster spriteHue is null (not numeric)', () => {
    const { sprite } = makeSprite({ rosterHue: null, localHue: 88 });
    expect(sprite.hue).toBe(88);
  });

  it('defaults to 0 when neither roster nor localStorage has a hue', () => {
    const { sprite } = makeSprite({});
    expect(sprite.hue).toBe(0);
  });
});
