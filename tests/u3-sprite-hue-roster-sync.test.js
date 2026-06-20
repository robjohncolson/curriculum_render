/**
 * tests/u3-sprite-hue-roster-sync.test.js
 *
 * Regression guard for the avatar-color drift between the quiz and the Desk's
 * Live Classroom board.
 *
 * Root cause (pre-fix): the PlayerSprite constructor treats
 * rosterClient.current().spriteHue as authoritative on every load and
 * overwrites the device-local stores with it -- but the color picker
 * (saveSpriteConfig) wrote the new hue to localStorage + IDB + the SERVER and
 * never to the cached roster session. So a freshly picked color was reverted to
 * the stale sign-in hue on the next plain refresh, while the Desk (reading the
 * freshly-PATCHed roster.sprite_hue) showed the new color.
 *
 * Fix: rosterClient.updateSpriteHue(hue) writes the pick into the persisted
 * session, and saveSpriteConfig calls it. This test loads the REAL
 * roster-client.js and player_sprite.js into a vm (cr tests are
 * environment:'node') and proves the pick now survives a reload.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const ROOT       = resolve(__dirname, '..');
const ROSTER_SRC = readFileSync(resolve(ROOT, 'roster-client.js'), 'utf8');
const PLAYER_SRC = readFileSync(resolve(ROOT, 'js/entities/player_sprite.js'), 'utf8');
const INDEX_SRC  = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

// fnBody: extract a named function's body from source.
// (copied verbatim from u3-sprite-hue-persist.test.js -- stable util)
function fnBody(src, name) {
    const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
    const m = re.exec(src);
    if (!m) throw new Error('not found: ' + name);

    let i = src.indexOf('(', m.index);
    let paren = 0;
    for (; i < src.length; i++) {
        if (src[i] === '(') paren++;
        else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
    }

    let depth = 0;
    for (let j = src.indexOf('{', i); j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
    }
    throw new Error('unbalanced: ' + name);
}

// Build a vm context with the REAL roster-client.js loaded against a backing
// localStorage map. waitForStorage is intentionally left undefined so the
// player sprite's IDB helpers early-return (no IDB needed in the harness).
function makeEnv(initialSession) {
    const store = new Map();
    if (initialSession !== undefined) {
        store.set('apstats_roster.v1', JSON.stringify(initialSession));
    }
    const windowStub = { addEventListener() {}, removeEventListener() {} };
    const sandbox = {
        window: windowStub,
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k),
        },
        JSON,
        console,
    };
    const ctx = createContext(sandbox);
    runInContext(ROSTER_SRC, ctx);
    return { sandbox, store, ctx };
}

// Construct a PlayerSprite inside an env's context (the constructor reads
// window.rosterClient.current().spriteHue -- the real client loaded above).
function constructSprite(ctx, sandbox) {
    runInContext(PLAYER_SRC + '\nthis.__PlayerSprite = PlayerSprite;', ctx);
    const stubSheet = { frameWidth: 80, frameHeight: 96 };
    return new sandbox.__PlayerSprite(stubSheet, 0, 0);
}

// ---------------------------------------------------------------------------
// 1. roster-client.updateSpriteHue (unit)
// ---------------------------------------------------------------------------

describe('roster-client updateSpriteHue', () => {
    it('writes spriteHue into the persisted session and current() reads it back', () => {
        const { sandbox, store } = makeEnv({ studentId: 's1', username: 'u', spriteHue: null });
        const rc = sandbox.window.rosterClient;
        expect(rc.updateSpriteHue(145)).toBe(true);
        expect(rc.current().spriteHue).toBe(145);
        expect(JSON.parse(store.get('apstats_roster.v1')).spriteHue).toBe(145);
    });

    it('accepts hue 0 (no rotation = base sprite is a valid pick)', () => {
        const { sandbox } = makeEnv({ studentId: 's1', spriteHue: 200 });
        const rc = sandbox.window.rosterClient;
        expect(rc.updateSpriteHue(0)).toBe(true);
        expect(rc.current().spriteHue).toBe(0);
    });

    it('no-ops (returns false) when signed out -- no session is created', () => {
        const { sandbox, store } = makeEnv(); // no session
        const rc = sandbox.window.rosterClient;
        expect(rc.updateSpriteHue(120)).toBe(false);
        expect(store.has('apstats_roster.v1')).toBe(false);
    });

    it('rejects non-finite / non-numeric hue without mutating the session', () => {
        const { sandbox } = makeEnv({ studentId: 's1', spriteHue: 50 });
        const rc = sandbox.window.rosterClient;
        expect(rc.updateSpriteHue('90')).toBe(false);
        expect(rc.updateSpriteHue(NaN)).toBe(false);
        expect(rc.updateSpriteHue(Infinity)).toBe(false);
        expect(rc.current().spriteHue).toBe(50);
    });

    it('preserves the rest of the session (studentId / token / username)', () => {
        const { sandbox, store } = makeEnv({ studentId: 's1', username: 'Cherry_Lemon', token: 't', spriteHue: 10 });
        const rc = sandbox.window.rosterClient;
        rc.updateSpriteHue(99);
        const sess = JSON.parse(store.get('apstats_roster.v1'));
        expect(sess.studentId).toBe('s1');
        expect(sess.username).toBe('Cherry_Lemon');
        expect(sess.token).toBe('t');
        expect(sess.spriteHue).toBe(99);
    });
});

// ---------------------------------------------------------------------------
// 2. End-to-end regression: a picked hue survives the next load
// ---------------------------------------------------------------------------

describe('avatar hue: a picked color survives a reload (no revert to stale sign-in hue)', () => {
    it('updateSpriteHue makes the next-constructed sprite read the NEW hue', () => {
        // Sign-in seeded the session (and device-local store) with hue 200.
        const { sandbox, store, ctx } = makeEnv({ studentId: 's1', username: 'Cherry_Lemon', spriteHue: 200 });
        store.set('spriteColorHue', '200');
        const rc = sandbox.window.rosterClient;
        expect(rc.current().spriteHue).toBe(200);

        // Student picks a new color (30): saveSpriteConfig writes local + server
        // + (the fix) the roster session.
        store.set('spriteColorHue', '30');          // local write
        expect(rc.updateSpriteHue(30)).toBe(true);  // the fix: session stays in sync
        expect(rc.current().spriteHue).toBe(30);

        // Next plain reload: the constructor reads the roster session. Pre-fix it
        // read the stale 200 and clobbered local back to 200; now it reads 30.
        const sprite = constructSprite(ctx, sandbox);
        expect(sprite.hue).toBe(30);
        expect(store.get('spriteColorHue')).toBe('30'); // not re-clobbered to 200
    });
});

// ---------------------------------------------------------------------------
// 3. saveSpriteConfig wires the roster-session sync (structural)
// ---------------------------------------------------------------------------

describe('saveSpriteConfig wires rosterClient.updateSpriteHue (structural)', () => {
    let body;
    beforeAll(() => { body = fnBody(INDEX_SRC, 'saveSpriteConfig'); });

    it('calls rosterClient.updateSpriteHue with the picked hue', () => {
        expect(body).toMatch(/rosterClient\.updateSpriteHue\s*\(\s*hue\s*\)/);
    });

    it('guards the call (typeof === function) so it never breaks the local save', () => {
        expect(body).toMatch(/typeof\s+window\.rosterClient\.updateSpriteHue\s*===\s*'function'/);
    });

    it('does the session sync AFTER the local setHue / localStorage writes', () => {
        const setHuePos = body.indexOf('playerSprite.setHue');
        const syncPos   = body.indexOf('updateSpriteHue');
        expect(setHuePos).toBeGreaterThan(-1);
        expect(syncPos).toBeGreaterThan(setHuePos);
    });
});
