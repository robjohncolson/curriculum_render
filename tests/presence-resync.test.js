/**
 * tests/presence-resync.test.js
 *
 * The server periodically re-broadcasts the FULL presence snapshot so a client
 * that missed an incremental user_online/user_offline (a brief drop, a throttled
 * tab) self-heals to the true live set instead of drifting — both the Desk and cr
 * REPLACE their set on a presence_snapshot, so they converge. cr is
 * environment:'node' — source pin on the real server.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let server = '';
beforeAll(() => { server = readFileSync(resolve(__dirname, '..', 'railway-server/server.js'), 'utf8'); });

describe('presence — periodic full resync', () => {
  it('defines a resync interval constant (env-tunable)', () => {
    expect(server).toMatch(/PRESENCE_RESYNC_MS\s*=\s*parseInt\(process\.env\.PRESENCE_RESYNC_MS/);
  });
  it('re-broadcasts a FULL presence_snapshot to all clients on that interval', () => {
    expect(server).toMatch(/broadcastToClients\(\{\s*type:\s*'presence_snapshot',\s*users:\s*getOnlineUsernames\(\)/);
    expect(server).toMatch(/\}, PRESENCE_RESYNC_MS\)/);
  });
});
