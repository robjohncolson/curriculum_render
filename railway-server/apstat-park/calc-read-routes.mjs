// The Desk's read-only calculator views over HTTP (no grades, no writes):
//   GET /park/calc/due?section=&username=&skills=   ABSORB_SPEC §5: due skills, most overdue first
//   GET /park/calc/progress?section=&username=       ABSORB_2_SPEC §5: every skill with clears, rung, recall
// Both answer with the same identity the park itself trusts (section + username). The section
// must be a real classroom section (shared-classroom.mjs CLASSROOM_SECTIONS): these routes are
// public, and a read for an unknown section would allocate that section in the clears and recall
// modules and start a database load for it, once per distinct string, forever.
//   400  section missing, unknown, or username missing
//   500  the park service threw (never for bad input)
import { isClassroomSection } from './shared-classroom.mjs';

const MAX_USERNAME = 64;

function queryText(value, max) {
  const text = String(value ?? '').trim();
  return text.length <= max ? text : '';
}

// park: the park service (service.mjs). known: section predicate, for tests.
export function createCalcReadHandlers({ park, known = isClassroomSection }) {
  function identity(req, res) {
    const section = queryText(req.query?.section, MAX_USERNAME), username = queryText(req.query?.username, MAX_USERNAME);
    if (!section || !username) { res.status(400).json({ ok: false, error: 'section and username required' }); return null; }
    if (!known(section)) { res.status(400).json({ ok: false, error: 'unknown section' }); return null; }
    return { section, username };
  }
  return {
    due(req, res) {
      const who = identity(req, res);
      if (!who) return;
      const skills = String(req.query?.skills || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 64);
      try { res.json({ ok: true, ...park.calcDue(who.section, who.username, skills) }); }
      catch (error) { res.status(500).json({ ok: false, error: error.message }); }
    },
    progress(req, res) {
      const who = identity(req, res);
      if (!who) return;
      try { res.json({ ok: true, ...park.calcProgress(who.section, who.username) }); }
      catch (error) { res.status(500).json({ ok: false, error: error.message }); }
    },
  };
}
