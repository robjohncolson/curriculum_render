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

describe('teacher-verify.html — on-device teacher sign-in (mobile cross-check)', () => {
  it('has a teacher sign-in form (username + password)', () => {
    expect(HTML).toContain('id="signin-box"');
    expect(HTML).toContain('id="si-user"');
    expect(HTML).toMatch(/id="si-pass"[^>]*type="password"/);
    expect(HTML).toContain('id="si-btn"');
  });

  it('signs in via rosterClient.signIn and re-runs the cross-check', () => {
    expect(HTML).toMatch(/function doTeacherSignIn/);
    expect(HTML).toContain('rosterClient.signIn(u, p)');
    expect(HTML).toMatch(/_lastTranscript[\s\S]{0,80}crossCheck\(_lastTranscript\)/);
  });

  it('pre-fills the username from the ?u= QR bridge, and never accepts a token via URL', () => {
    expect(HTML).toMatch(/URLSearchParams\(location\.search\)\.get\('u'\)/);
    expect(HTML).not.toMatch(/\.get\('token'\)/);
  });

  it('shows the sign-in form only when not a signed-in teacher', () => {
    expect(HTML).toMatch(/box\.style\.display = isT \? 'none' : 'block'/);
  });
});
