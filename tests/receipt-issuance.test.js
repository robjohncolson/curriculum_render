import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyWrongMcqCap,
  getReceiptIssuer,
  initReceipts,
  issueReceipt,
  receiptInternals
} from '../railway-server/receipts.js';

const TEST_PRIVATE_KEY = 'MC4CAQAwBQYDK2VwBCIEIEtFFgiPZyvBY+Udt3F77ZOHGypDcMHVJV9ck+a6kToO';
const TEST_PUBLIC_KEY = 'ysLRAoc-rg-N2VTE2IR9s6Z1QT--9X64Qg3Px-6rUow';

function decodeCompact(compact) {
  const [payloadB64, sigB64] = compact.split('.');
  return {
    bytes: Buffer.from(payloadB64, 'base64url'),
    sig: Buffer.from(sigB64, 'base64url'),
    payload: JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  };
}

afterEach(() => {
  delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
  vi.restoreAllMocks();
  initReceipts();
});

describe('signed receipt issuance', () => {
  it('canonicalizes and signs the frozen test vector byte-for-byte', () => {
    const payload = {
      ah: '3a1f0c9b2d4e5f60',
      n: 'a1b2c3d4',
      q: 'U4-L3-Q01',
      s: 'E',
      t: 'verdict',
      ts: 1781234567890,
      u: 'Apple_Monkey',
      v: 1
    };
    const privateKey = receiptInternals.createPrivateKey(TEST_PRIVATE_KEY);

    const signed = receiptInternals.signPayload(privateKey, payload);

    expect(signed.canonical).toBe('{"ah":"3a1f0c9b2d4e5f60","n":"a1b2c3d4","q":"U4-L3-Q01","s":"E","t":"verdict","ts":1781234567890,"u":"Apple_Monkey","v":1}');
    expect(signed.receiptId).toBe('ecceb8d3a527a91214b2d479f779cceb58b60e97e897508b5161e3a8b297b622');
    expect(signed.sig).toBe('fxr2OUgg98CHgo8zrNkqT5DAdxa7emYOlN82z1elKBorO8HqUH0K4Z7AH-FDr7EeLPGF6Xeg2FT-dEOMlxuPCw');
  });

  it('omits score from answer receipt canonical payloads', () => {
    const canonical = receiptInternals.canonicalize({
      v: 1,
      t: 'answer',
      u: 'Apple_Monkey',
      q: 'U4-L3-Q01',
      ah: '3a1f0c9b2d4e5f60',
      ts: 1781234567890,
      n: 'a1b2c3d4',
      s: undefined
    });

    expect(canonical).toBe('{"ah":"3a1f0c9b2d4e5f60","n":"a1b2c3d4","q":"U4-L3-Q01","t":"answer","ts":1781234567890,"u":"Apple_Monkey","v":1}');
  });

  it('round-trips signatures with a freshly generated key', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const signed = receiptInternals.signPayload(privateKey, {
      v: 1,
      t: 'answer',
      u: 'Fresh_User',
      q: 'U1-L1-Q01',
      ah: '0000000000000000',
      ts: 1781234567890,
      n: '01020304'
    });
    const decoded = decodeCompact(signed.compact);

    expect(crypto.verify(null, decoded.bytes, publicKey, decoded.sig)).toBe(true);
    expect(decoded.payload.t).toBe('answer');
  });

  it('returns null and exposes disabled issuer metadata when unset', () => {
    delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
    initReceipts();

    expect(issueReceipt({
      type: 'answer',
      username: 'Apple_Monkey',
      questionId: 'U4-L3-Q01',
      answerValue: 'A'
    })).toBeNull();
    expect(getReceiptIssuer()).toEqual({ enabled: false });
  });

  it('refuses to issue unattributable receipts (missing username or questionId)', () => {
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
    initReceipts();

    expect(issueReceipt({
      type: 'verdict',
      username: '',
      questionId: 'U4-L3-Q01',
      score: 'E',
      answerValue: 'A'
    })).toBeNull();
    expect(issueReceipt({
      type: 'answer',
      username: 'Apple_Monkey',
      questionId: '',
      answerValue: 'A'
    })).toBeNull();
  });

  it('issues verdict receipts after the wrong-MCQ E-to-P cap', () => {
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
    initReceipts();
    vi.spyOn(Date, 'now').mockReturnValue(1781234567890);

    const result = { score: 'E', feedback: 'Looks correct.' };
    const scenario = {
      questionId: 'U4-L3-Q01',
      questionType: 'multiple-choice',
      correctAnswer: 'B'
    };
    const answers = { answer: 'A' };

    applyWrongMcqCap(result, scenario, answers);
    const receipt = issueReceipt({
      type: 'verdict',
      username: 'Apple_Monkey',
      questionId: scenario.questionId,
      score: result.score,
      answerValue: answers.answer
    });
    const decoded = decodeCompact(receipt.compact);
    const publicKey = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: TEST_PUBLIC_KEY },
      format: 'jwk'
    });

    expect(result.score).toBe('P');
    expect(decoded.payload.s).toBe('P');
    expect(decoded.payload.ts).toBe(1781234567890);
    expect(crypto.verify(null, decoded.bytes, publicKey, decoded.sig)).toBe(true);
  });
});
