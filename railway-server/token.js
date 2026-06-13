// token.js — compact HMAC-SHA256 session token (D-C)
// Format: b64url(JSON {sid,exp}) + "." + b64url(HMAC_SHA256(firstPart, secret))
// Node crypto only — no JWT lib.

import { createHmac } from 'crypto';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function toBase64url(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(str) {
  // Pad back to standard base64 before decoding
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(pad), 'base64');
}

function hmac(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest();
}

export function signToken(studentId) {
  const secret = process.env.ROSTER_TOKEN_SECRET;
  if (!secret) throw new Error('ROSTER_TOKEN_SECRET is not set');

  const exp = Date.now() + THIRTY_DAYS_MS;
  const header = toBase64url(Buffer.from(JSON.stringify({ sid: studentId, exp })));
  const sig = toBase64url(hmac(header, secret));

  return `${header}.${sig}`;
}

// Returns studentId string on valid/unexpired token, null otherwise.
export function verifyToken(token) {
  const secret = process.env.ROSTER_TOKEN_SECRET;
  if (!secret || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [header, sig] = parts;

  // Constant-time signature check
  const expected = toBase64url(hmac(header, secret));
  if (expected !== sig) return null;

  let payload;
  try {
    payload = JSON.parse(fromBase64url(header).toString('utf8'));
  } catch {
    return null;
  }

  if (!payload.sid || !payload.exp) return null;
  if (Date.now() > payload.exp) return null;

  return payload.sid;
}
