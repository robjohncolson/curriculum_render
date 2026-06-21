/**
 * tests/nudge-notify.test.js
 *
 * Persistent teacher/student chat uses roster-server for message data and the
 * curriculum_render WebSocket only as a cosmetic "go fetch" relay.
 * cr tests run in node, so this source-pins the real server switch case.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let server = '';
let block = '';

beforeAll(() => {
  server = readFileSync(resolve(__dirname, '..', 'railway-server/server.js'), 'utf8');
  const start = server.indexOf("case 'nudge_notify':");
  expect(start).toBeGreaterThan(-1);
  const end = server.indexOf("case 'classroom_join':", start);
  expect(end).toBeGreaterThan(start);
  block = server.slice(start, end);
});

describe('nudge_notify relay', () => {
  it('adds a WebSocket switch case beside candy_gift_received', () => {
    const candy = server.indexOf("case 'candy_gift_received':");
    const nudge = server.indexOf("case 'nudge_notify':");
    expect(candy).toBeGreaterThan(-1);
    expect(nudge).toBeGreaterThan(candy);
  });

  it('caps recipient count, lowercases usernames, and slices each username to 64 chars', () => {
    expect(block).toMatch(/Array\.isArray\(data\.toUsernames\)/);
    expect(block).toMatch(/nnRecipients\.slice\(0,\s*64\)/);
    expect(block).toMatch(/toLowerCase\(\)\.slice\(0,\s*64\)/);
    expect(block).toMatch(/filter\(Boolean\)/);
    expect(block).toMatch(/if\s*\(nnToUsernames\.length\s*===\s*0\)\s*break/);
  });

  it('broadcasts only cosmetic notify fields, never message text', () => {
    expect(block).toMatch(/broadcastToClients\(\{/);
    expect(block).toMatch(/type:\s*'nudge_notify'/);
    expect(block).toMatch(/toUsernames:\s*nnToUsernames/);
    expect(block).toMatch(/fromUsername:[\s\S]*toLowerCase\(\)\.slice\(0,\s*64\)/);
    expect(block).toMatch(/nudgeId:[\s\S]*slice\(0,\s*128\)/);
    expect(block).toMatch(/timestamp:\s*Date\.now\(\)/);
    expect(block).not.toMatch(/\btext\b/);
  });
});
