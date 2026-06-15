/**
 * tests/teacher-verify.test.js
 *
 * Structural pins for teacher-verify.html — the teacher scan-to-verify tool:
 * scans a printed-summary / receipt QR (camera or photo), verifies it with the
 * shared Ed25519 core, and (teacher only) cross-checks the sealed grade against
 * the live gradebook. Pins the wiring so the pieces stay connected.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let HTML;
beforeAll(() => {
  HTML = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'teacher-verify.html'), 'utf8');
});

describe('teacher-verify.html — scan-to-verify + gradebook cross-check', () => {
  it('loads the shared verify core, the scanner lib, and the roster client', () => {
    expect(HTML).toContain('receipt-verify.js');
    expect(HTML).toContain('lib/html5-qrcode.min.js');
    expect(HTML).toContain('roster-client.js');
  });

  it('uses ReceiptVerify to parse and verify scanned input', () => {
    expect(HTML).toMatch(/ReceiptVerify\.parseVerifyTarget/);
    expect(HTML).toMatch(/ReceiptVerify\.verifyReceipt/);
  });

  it('reuses the camera + photo scanner (Html5Qrcode)', () => {
    expect(HTML).toContain('Html5Qrcode');
    expect(HTML).toMatch(/scanFile/);
  });

  it('cross-checks the sealed grade against /class/grades by quarterGrade', () => {
    expect(HTML).toContain('/class/grades');
    expect(HTML).toMatch(/quarters\b/);
    expect(HTML).toMatch(/quarterGrade/);
    expect(HTML).toContain('studentId === p.sid');
  });

  it('gates the cross-check on a signed-in teacher', () => {
    expect(HTML).toMatch(/function isTeacher/);
    expect(HTML).toContain("role === 'teacher'");
  });

  it('handles a #r= deep-link on load', () => {
    expect(HTML).toMatch(/location\.hash\.match/);
    expect(HTML).toContain('[#&]r=');
  });
});
