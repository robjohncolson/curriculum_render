/* receipt-verify.js — shared Ed25519 receipt/transcript verification core.
 *
 * Single source of truth for the signed-receipt crypto, used by BOTH:
 *   - verify.html         (the public verifier: paste / drag / scan-via-phone)
 *   - teacher-verify.html  (the teacher scan-to-verify + gradebook cross-check)
 *
 * Classic <script>: it defines the verification functions as GLOBALS (the names
 * verify.html already uses) AND exposes them under window.ReceiptVerify for
 * callers that prefer a namespace. Keeping the crypto in one file means the two
 * verifier pages can never drift apart on the security-critical path.
 *
 * Issuer registry: base64url raw 32-byte Ed25519 public keys. Verification
 * tries production keys by default and reports which issuer signed. For key
 * rotation, APPEND new production keys here and never remove old trusted keys;
 * see KEY_MANAGEMENT_RUNBOOK.md.
 */
(function (root) {
  'use strict';

  var ISSUERS = [
    { name: 'Quiz Server', pubkey: 'yFByWH5a7OwhF2KOD3SLd1BE4MlHEN_JDtDaMwW-Eg4', kind: 'quiz' },
    { name: 'The Desk',    pubkey: 'DRfEbaWByfatxMq26iHrw4wxt4MIpypZlbB3GeBFSO4', kind: 'desk' },
    { name: 'Quiz Server (TEST)', pubkey: 'ysLRAoc-rg-N2VTE2IR9s6Z1QT--9X64Qg3Px-6rUow', kind: 'quiz', test: true },
    { name: 'The Desk (TEST)',    pubkey: 'sj9NUx5jBO-KTI58WKjQwEr22i7f8fiv--KH4z95JCc', kind: 'desk', test: true }
  ];

  function b64urlToBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  var keyCache = new Map();
  function importIssuerKey(pubkey) {
    if (!keyCache.has(pubkey)) {
      keyCache.set(pubkey, crypto.subtle.importKey(
        'raw', b64urlToBytes(pubkey), { name: 'Ed25519' }, false, ['verify']
      ));
    }
    return keyCache.get(pubkey);
  }

  // Test issuer keys are only honored when ?test=1 (query or hash). Browser-only.
  function hasTestModeFlag() {
    var query = new URLSearchParams(location.search);
    var hashQuery = location.hash.includes('?')
      ? location.hash.slice(location.hash.indexOf('?') + 1)
      : location.hash.replace(/^#/, '');
    var hash = new URLSearchParams(hashQuery);
    return query.get('test') === '1' || hash.get('test') === '1';
  }

  function issuersForRun(includeTestKeys) {
    return ISSUERS.filter(function (issuer) { return includeTestKeys || !issuer.test; });
  }

  // Verify one compact receipt ("payloadB64url.sigB64url"). Returns
  // { ok, issuer, payload, receiptId }. ok=false means no known production
  // (or, with includeTestKeys, test) issuer signed these exact bytes.
  async function verifyReceipt(compact, options) {
    options = options || {};
    var parts = compact.trim().split('.');
    if (parts.length !== 2) throw new Error('Not a receipt: expected two dot-separated parts.');
    var payloadBytes = b64urlToBytes(parts[0]);
    var sigBytes = b64urlToBytes(parts[1]);
    var payload;
    try { payload = JSON.parse(new TextDecoder().decode(payloadBytes)); }
    catch (e) { throw new Error('Receipt payload is not valid JSON.'); }
    if (payload.v !== 1) throw new Error('Unknown receipt version: ' + payload.v);

    var issuer = null;
    var candidates = issuersForRun(!!options.includeTestKeys);
    for (var i = 0; i < candidates.length; i++) {
      var key = await importIssuerKey(candidates[i].pubkey);
      if (await crypto.subtle.verify({ name: 'Ed25519' }, key, sigBytes, payloadBytes)) {
        issuer = candidates[i];
        break;
      }
    }
    var receiptId = hex(await crypto.subtle.digest('SHA-256', payloadBytes));
    return { ok: !!issuer, issuer: issuer, payload: payload, receiptId: receiptId };
  }

  async function sha256HexText(s) {
    return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  }

  // Pull the verifiable token out of whatever a QR scan / paste produced:
  //   - a full verify URL ( …/verify.html#r=<compact>  or  #commit=<deep> )
  //   - a bare compact receipt ( payload.sig )
  // Returns { kind:'receipt'|'commit', value } or null if unrecognized.
  function parseVerifyTarget(text) {
    if (!text) return null;
    var str = String(text).trim();
    var hashIdx = str.indexOf('#');
    if (hashIdx >= 0) {
      var hash = str.slice(hashIdx + 1);
      var rm = hash.match(/(?:^|&)r=([^&]+)/);
      if (rm) { try { return { kind: 'receipt', value: decodeURIComponent(rm[1]) }; } catch (e) { return { kind: 'receipt', value: rm[1] }; } }
      var cm = hash.match(/(?:^|&)commit=([^&]+)/);
      if (cm) { try { return { kind: 'commit', value: decodeURIComponent(cm[1]) }; } catch (e) { return { kind: 'commit', value: cm[1] }; } }
    }
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(str)) return { kind: 'receipt', value: str };
    return null;
  }

  var api = {
    ISSUERS: ISSUERS,
    b64urlToBytes: b64urlToBytes,
    hex: hex,
    importIssuerKey: importIssuerKey,
    hasTestModeFlag: hasTestModeFlag,
    issuersForRun: issuersForRun,
    verifyReceipt: verifyReceipt,
    sha256HexText: sha256HexText,
    parseVerifyTarget: parseVerifyTarget
  };

  // Namespace for new callers...
  root.ReceiptVerify = api;
  // ...and the bare globals verify.html's inline code already references.
  root.ISSUERS = ISSUERS;
  root.b64urlToBytes = b64urlToBytes;
  root.hex = hex;
  root.importIssuerKey = importIssuerKey;
  root.hasTestModeFlag = hasTestModeFlag;
  root.issuersForRun = issuersForRun;
  root.verifyReceipt = verifyReceipt;
  root.sha256HexText = sha256HexText;
  root.parseVerifyTarget = parseVerifyTarget;
})(typeof window !== 'undefined' ? window : this);
