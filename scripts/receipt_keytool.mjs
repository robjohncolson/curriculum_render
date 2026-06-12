#!/usr/bin/env node
/**
 * receipt_keytool.mjs — reference implementation for the receipt contract v1.
 * See docs/receipt-system-spec.md. This script is the source of truth for
 * canonicalization, receiptId, and signing; the Railway server and verify.html
 * must reproduce its output byte-for-byte.
 *
 * Usage:
 *   node scripts/receipt_keytool.mjs gen
 *     -> prints RECEIPT_ISSUER_PRIVATE_KEY (base64 PKCS8 DER) and pubkey (base64url raw 32B)
 *   node scripts/receipt_keytool.mjs sign <privkey-b64-pkcs8> '<payload-json>'
 *     -> prints canonical form, receiptId, signature, and compact receipt
 *   node scripts/receipt_keytool.mjs verify <pubkey-b64url-raw> '<compact-receipt>'
 *     -> verifies a compact receipt offline
 */
import crypto from 'node:crypto';

function canonicalize(payload) {
    // Contract: payload MUST be a flat object. Sorted keys, no whitespace.
    const sorted = {};
    for (const k of Object.keys(payload).sort()) sorted[k] = payload[k];
    return JSON.stringify(sorted);
}

function b64url(buf) {
    return Buffer.from(buf).toString('base64url');
}

function sign(privKeyB64, payload) {
    const key = crypto.createPrivateKey({
        key: Buffer.from(privKeyB64, 'base64'),
        format: 'der',
        type: 'pkcs8',
    });
    const canonical = canonicalize(payload);
    const bytes = Buffer.from(canonical, 'utf8');
    const receiptId = crypto.createHash('sha256').update(bytes).digest('hex');
    const sig = crypto.sign(null, bytes, key); // Ed25519: algorithm must be null
    const compact = `${b64url(bytes)}.${b64url(sig)}`;
    return { canonical, receiptId, sig: b64url(sig), compact };
}

function verify(pubKeyB64url, compact) {
    const [p, s] = compact.split('.');
    const bytes = Buffer.from(p, 'base64url');
    const key = crypto.createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: pubKeyB64url },
        format: 'jwk',
    });
    const ok = crypto.verify(null, bytes, key, Buffer.from(s, 'base64url'));
    const receiptId = crypto.createHash('sha256').update(bytes).digest('hex');
    return { ok, receiptId, payload: JSON.parse(bytes.toString('utf8')) };
}

const [, , cmd, ...args] = process.argv;

if (cmd === 'gen') {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
    const rawPub = publicKey.export({ format: 'jwk' }).x; // JWK x == base64url(raw 32 bytes)
    console.log('RECEIPT_ISSUER_PRIVATE_KEY (set in Railway env, NEVER commit):');
    console.log(pkcs8);
    console.log('\nRECEIPT_ISSUER_PUBKEY (paste into js/receipt_config.js + verify.html):');
    console.log(rawPub);
} else if (cmd === 'sign') {
    const [priv, json] = args;
    const out = sign(priv, JSON.parse(json));
    console.log(JSON.stringify(out, null, 2));
} else if (cmd === 'verify') {
    const [pub, compact] = args;
    console.log(JSON.stringify(verify(pub, compact), null, 2));
} else {
    console.error('usage: receipt_keytool.mjs gen | sign <priv> <json> | verify <pub> <compact>');
    process.exit(1);
}

export { canonicalize, sign, verify };
