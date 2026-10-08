// POST /park/campaign/keys/grant — a campaign key bought with candy (PICO_DESK_SPEC "Candy economy",
// items 7-9). Called server-to-server by roster-server's POST /wallet/buy-key AFTER it has debited the
// candy. Body: { studentId, receiptId, username, section, role }.
//
//   403  { rejected: true }  missing / wrong x-park-grant-secret header   } DEFINITIVE: nothing was
//   400  { rejected: true }  malformed body                               } granted; roster refunds
//   200  { ok, granted, keys, section }  granted: false = this receipt was already granted (a retry)
//   503  PARK_KEY_GRANT_SECRET unset, no park database, or the wallet could not load / write. The
//        grant MAY have committed (a lost database reply), so roster-server holds the candy and
//        retries the same receipt; it never refunds on a 503.
//
// Idempotent on receiptId, so roster-server may safely retry a grant whose reply was lost.
import { timingSafeEqual } from 'node:crypto';

const RECEIPT_RE = /^[A-Za-z0-9-]{8,64}$/;

function sameSecret(given, expected) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function text(value, max = 64) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : '';
}

// park: the park service (service.mjs), which owns the wallet and the room push.
// secret: read per request so the env var can be set without a code change.
export function createKeyGrantHandler({ park, secret = () => process.env.PARK_KEY_GRANT_SECRET,
  log = (...args) => console.warn(...args) }) {
  return async function grantKeyRoute(req, res) {
    const expected = String(secret() || '').trim();
    if (!expected) return res.status(503).json({ ok: false, error: 'key grants are not configured' });
    if (!sameSecret(req.headers?.['x-park-grant-secret'] || '', expected)) {
      return res.status(403).json({ ok: false, rejected: true, error: 'forbidden' });
    }

    const body = req.body || {};
    const receiptId = text(body.receiptId);
    const username = text(body.username);
    const section = text(body.section);
    const role = body.role === 'teacher' ? 'teacher' : 'student';
    if (!RECEIPT_RE.test(receiptId)) return res.status(400).json({ ok: false, rejected: true, error: 'receiptId required' });
    if (!username || !section) return res.status(400).json({ ok: false, rejected: true, error: 'username and section required' });

    try {
      const result = await park.grantKey({ username, section, role, receiptId });
      return res.json({ ok: true, granted: result.granted, keys: result.keys, section: result.section });
    } catch (error) {
      log('park key grant failed:', receiptId, error?.message || error);
      return res.status(503).json({ ok: false, error: 'key grant unavailable' });
    }
  };
}
