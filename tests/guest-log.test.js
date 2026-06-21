/**
 * tests/guest-log.test.js
 *
 * Guest-login logging. Presence (the doge feed + Live Classroom registry) is
 * in-memory only, so a guest who logs on but never answers leaves no DB trace.
 * logGuestSession persists every guest identify/classroom_join to guest_log;
 * GET /api/guest-log reads it. cr tests are environment:'node' (no jsdom) —
 * source pins on the real server + migration, mirroring the cr conventions.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
let server = '', migration = '';
beforeAll(() => {
  server = readFileSync(resolve(ROOT, 'railway-server/server.js'), 'utf8');
  const mp = resolve(ROOT, 'railway-server/migrations/0001_guest_log.sql');
  migration = existsSync(mp) ? readFileSync(mp, 'utf8') : '';
});

describe('guest-log — server persists every guest login', () => {
  it('logGuestSession is defined, guests-only, writes guest_log, debounced, fire-and-forget', () => {
    expect(server).toMatch(/function logGuestSession\s*\(/);
    expect(server).toMatch(/\/\^Guest_\/i\.test\(username\)/);     // guests only
    expect(server).toMatch(/\.from\('guest_log'\)\s*\.insert/);    // writes the table
    expect(server).toMatch(/_guestLogSeen/);                        // per-guest debounce map
    expect(server).toMatch(/GUEST_LOG_DEBOUNCE_MS/);
    expect(server).toMatch(/catch\s*\(/);                           // never breaks presence
    expect(server).toMatch(/_guestLogSeen\.delete\(username\)/);    // clear debounce on insert failure (allow retry)
  });

  it('identify AND classroom_join both log guest sessions', () => {
    expect(server).toMatch(/logGuestSession\(username, loc, 'identify'\)/);
    expect(server).toMatch(/logGuestSession\(username, \{ surface: 'classroom'[\s\S]{0,80}'classroom_join', section\)/);
  });
});

describe('guest-log — GET /api/guest-log read endpoint', () => {
  it('exposes /api/guest-log returning recent sessions newest-first', () => {
    expect(server).toMatch(/app\.get\('\/api\/guest-log'/);
    expect(server).toMatch(/\.from\('guest_log'\)/);
    expect(server).toMatch(/order\('created_at',\s*\{\s*ascending:\s*false\s*\}\)/);
  });
  it('returns 503 (not 500) before the table is migrated (42P01)', () => {
    const m = /app\.get\('\/api\/guest-log'[\s\S]*?\n\}\);/.exec(server);
    expect(m, '/api/guest-log block').not.toBeNull();
    expect(m[0]).toMatch(/42P01/);
    expect(m[0]).toMatch(/503/);
  });
});

describe('guest-log — migration', () => {
  it('0001_guest_log.sql creates the table + anon insert/select policies', () => {
    expect(migration).toMatch(/create table if not exists public\.guest_log/);
    expect(migration).toMatch(/guest_log_anon_insert/);
    expect(migration).toMatch(/guest_log_anon_select/);
  });
});
