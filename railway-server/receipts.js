import crypto from 'node:crypto';

let issuer = {
  enabled: false,
  privateKey: null,
  pubkey: null
};

function stringifyAnswerValue(value) {
  if (typeof value === 'string') return value;
  const stringified = JSON.stringify(value);
  return stringified === undefined ? String(value) : stringified;
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function canonicalize(payload) {
  const sorted = {};
  for (const key of Object.keys(payload).sort()) {
    if (payload[key] !== undefined) sorted[key] = payload[key];
  }
  return JSON.stringify(sorted);
}

function signPayload(privateKey, payload) {
  const canonical = canonicalize(payload);
  const bytes = Buffer.from(canonical, 'utf8');
  const receiptId = crypto.createHash('sha256').update(bytes).digest('hex');
  const signature = crypto.sign(null, bytes, privateKey);
  return {
    canonical,
    receiptId,
    sig: b64url(signature),
    compact: `${b64url(bytes)}.${b64url(signature)}`
  };
}

function createPrivateKey(privateKeyB64) {
  return crypto.createPrivateKey({
    key: Buffer.from(privateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8'
  });
}

export function initReceipts() {
  const privateKeyB64 = process.env.RECEIPT_ISSUER_PRIVATE_KEY;

  if (!privateKeyB64) {
    issuer = { enabled: false, privateKey: null, pubkey: null };
    console.log('Signed receipts disabled: RECEIPT_ISSUER_PRIVATE_KEY unset');
    return issuer;
  }

  try {
    const privateKey = createPrivateKey(privateKeyB64);
    const publicKey = crypto.createPublicKey(privateKey);
    issuer = {
      enabled: true,
      privateKey,
      pubkey: publicKey.export({ format: 'jwk' }).x
    };
    console.log('Signed receipts enabled: Ed25519 issuer loaded');
  } catch (err) {
    issuer = { enabled: false, privateKey: null, pubkey: null };
    console.error('Signed receipts disabled: failed to load issuer key:', err.message);
  }

  return issuer;
}

export function getReceiptIssuer() {
  if (!issuer.enabled) return { enabled: false };
  return {
    enabled: true,
    alg: 'Ed25519',
    v: 1,
    pubkey: issuer.pubkey
  };
}

export function issueReceipt({ type, username, questionId, score, answerValue }) {
  if (!issuer.enabled) return null;
  // A receipt that doesn't name a student proves nothing — don't issue one.
  if (!username || !questionId) return null;

  try {
    const valueString = stringifyAnswerValue(answerValue);
    const payload = {
      v: 1,
      t: type,
      u: username,
      q: questionId,
      ah: crypto.createHash('sha256').update(valueString, 'utf8').digest('hex').slice(0, 16),
      ts: Date.now(),
      n: crypto.randomBytes(4).toString('hex')
    };

    if (type === 'verdict') payload.s = score;

    const { receiptId, compact } = signPayload(issuer.privateKey, payload);
    return { receiptId, compact };
  } catch (err) {
    console.error('Receipt issuance failed:', err.message);
    return null;
  }
}

export function applyWrongMcqCap(result, scenario, answers) {
  const isMCQ = scenario?.questionType === 'multiple-choice';
  const studentAnswer = answers?.answer || Object.values(answers || {})[0] || '';
  const isCorrect = scenario?.correctAnswer
    ? studentAnswer.toString().toLowerCase().trim() === scenario.correctAnswer.toString().toLowerCase().trim()
    : null;

  if (isMCQ && isCorrect === false && result?.score === 'E') {
    console.log(`MCQ enforcement: Capping wrong answer from E to P for ${scenario.questionId}`);
    result.score = 'P';
    result.feedback = (result.feedback || '') + ' [Note: Maximum score for incorrect MCQ answers is P]';
    result._scoreCapped = true;
  }

  return result;
}

export const receiptInternals = {
  canonicalize,
  createPrivateKey,
  signPayload
};
