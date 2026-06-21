/**
 * tests/presence-username.test.js
 *
 * cr identifies to the GLOBAL presence feed with the CANONICAL roster username
 * (lowercase, e.g. 'date_tiger') — NOT the Title-cased window.currentUsername
 * ('Date_Tiger' from acceptUsername). Otherwise the SAME person becomes a second
 * presence entry (the "two Robert Colson" bug), because the Desk uses the
 * lowercase roster name and the server keys presence by the raw string. cr is
 * environment:'node' — source pin on the real client.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let client = '';
beforeAll(() => { client = readFileSync(resolve(__dirname, '..', 'railway_client.js'), 'utf8'); });

describe('cr presence — canonical roster username (no case duplicate)', () => {
  it('defines _presenceUsername preferring the roster username', () => {
    expect(client).toMatch(/function _presenceUsername\s*\(/);
    expect(client).toMatch(/rosterClient[\s\S]{0,60}\.current\(\)/);
    expect(client).toMatch(/r\.username/);
  });
  it('the identify + heartbeat both route through _presenceUsername', () => {
    const calls = (client.match(/=\s*_presenceUsername\(\)/g) || []).length;
    expect(calls).toBeGreaterThanOrEqual(2);   // heartbeat + identify
  });
});
