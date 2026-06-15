/**
 * tests/receipt-verify.test.js
 *
 * Regression coverage for the shared Ed25519 verification core after it was
 * extracted from verify.html into receipt-verify.js (loaded by both verify.html
 * and teacher-verify.html). Loads the real module in a vm with the host APIs it
 * needs (Web Crypto, atob, TextDecoder, …) and exercises verifyReceipt against
 * the same self-test vectors verify.html uses.
 *
 * Pure Node (cr tests are environment:'node'). Node's webcrypto supports Ed25519.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'receipt-verify.js'),
  'utf8'
);

// The exact verdict + ledger self-test vectors baked into verify.html — signed
// by the TEST issuer keys, so they only verify with { includeTestKeys: true }.
const TEST_VECTOR = 'eyJhaCI6IjNhMWYwYzliMmQ0ZTVmNjAiLCJuIjoiYTFiMmMzZDQiLCJxIjoiVTQtTDMtUTAxIiwicyI6IkUiLCJ0IjoidmVyZGljdCIsInRzIjoxNzgxMjM0NTY3ODkwLCJ1IjoiQXBwbGVfTW9ua2V5IiwidiI6MX0.fxr2OUgg98CHgo8zrNkqT5DAdxa7emYOlN82z1elKBorO8HqUH0K4Z7AH-FDr7EeLPGF6Xeg2FT-dEOMlxuPCw';
const TEST_VECTOR_LEDGER = 'eyJhIjoxLCJhaCI6IjNhMWYwYzliMmQ0ZTVmNjAiLCJlIjoicHJhY3RpY2UiLCJpIjoiV1MtVTRMMy1RMiIsIm4iOiJhMWIyYzNkNCIsInNjIjowLjUsInNpZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMCIsInNyYyI6IndvcmtzaGVldCIsInQiOiJsZWRnZXIiLCJ0cyI6MTc4MTIzNDU2Nzg5MCwidSI6IkFwcGxlX01vbmtleSIsInYiOjF9.h2UL76wqlGpAOtUKLrCT0_XZidjYYf_ToVEujCB4ge9WrEaXgUUs4mNhHUf6JPJxorOhVw03DDaTVYZE2k7WCw';

function loadModule() {
  const win = {};
  const sandbox = {
    window: win,
    crypto: webcrypto,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    TextDecoder,
    TextEncoder,
    URLSearchParams,
    location: { search: '', hash: '' },
    console,
  };
  const ctx = createContext(sandbox);
  runInContext(SRC, ctx);
  return win.ReceiptVerify;
}

describe('receipt-verify.js — shared Ed25519 verification core', () => {
  let RV;
  beforeAll(() => { RV = loadModule(); });

  it('exposes the verify API + issuer registry', () => {
    expect(typeof RV.verifyReceipt).toBe('function');
    expect(typeof RV.parseVerifyTarget).toBe('function');
    expect(Array.isArray(RV.ISSUERS)).toBe(true);
    expect(RV.ISSUERS.length).toBeGreaterThanOrEqual(4);
  });

  it('verifies a genuine receipt and reports the signing issuer', async () => {
    const r = await RV.verifyReceipt(TEST_VECTOR, { includeTestKeys: true });
    expect(r.ok).toBe(true);
    expect(r.issuer.test).toBe(true);
    expect(r.payload.t).toBe('verdict');
    expect(typeof r.receiptId).toBe('string');
    expect(r.receiptId).toHaveLength(64); // SHA-256 hex
  });

  it('verifies the ledger self-test vector too', async () => {
    const r = await RV.verifyReceipt(TEST_VECTOR_LEDGER, { includeTestKeys: true });
    expect(r.ok).toBe(true);
    expect(r.payload.t).toBe('ledger');
  });

  it('rejects a TEST receipt when only production issuers are trusted', async () => {
    const r = await RV.verifyReceipt(TEST_VECTOR, { includeTestKeys: false });
    expect(r.ok).toBe(false); // signed by a test key, no production issuer matches
  });

  it('rejects a tampered receipt (one payload byte flipped)', async () => {
    const parts = TEST_VECTOR.split('.');
    const last = parts[0].slice(-1);
    const flipped = parts[0].slice(0, -1) + (last === 'A' ? 'B' : 'A');
    const corrupted = flipped + '.' + parts[1];
    let ok = false;
    try { ok = (await RV.verifyReceipt(corrupted, { includeTestKeys: true })).ok; }
    catch (_) { ok = false; } // bad JSON after flip is also a rejection
    expect(ok).toBe(false);
  });

  it('parseVerifyTarget extracts #r= from a scanned verify URL', () => {
    const url = 'https://robjohncolson.github.io/curriculum_render/verify.html#r=' + encodeURIComponent(TEST_VECTOR);
    expect(RV.parseVerifyTarget(url)).toEqual({ kind: 'receipt', value: TEST_VECTOR });
  });

  it('parseVerifyTarget extracts #commit= and recognizes a bare receipt', () => {
    expect(RV.parseVerifyTarget('https://x/verify.html#commit=ABC123').kind).toBe('commit');
    expect(RV.parseVerifyTarget(TEST_VECTOR).kind).toBe('receipt');
    expect(RV.parseVerifyTarget('not a receipt or url')).toBeNull();
  });
});
