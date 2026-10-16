// The solo door's bonus point (APSTAT_PARK_TRAINER_ABSORB_SPEC §6, Phase 4). On the round that
// flips a skill to mastered (calculator-service onMastery), the relay banks ONE bonus point for
// the student through roster-server's teacher route POST /class/bonus: sheetId 'TI84-<skillId>',
// grade 'I' (1 point on the E/P/I scale), the open quarter asked of roster-server (never
// computed here). The row upserts at attempt 1, so a repeat is a no-op: one point per skill per
// student, forever. Nothing here touches a grade; the banked row waits for quarter close.
//
// Auth: the teacher key roster-server's requireTeacher reads from the x-teacher-secret header
// (TEACHER_KEY there), held by the relay as ROSTER_TEACHER_KEY. Without it the rail is off and
// every mastery is logged for the sweep (scripts/park-bonus-sweep.mjs).
//
// Failure never blocks the celebration: one retry, then a log line; park_calc_srs.mastered stays
// true and the sweep re-posts.
export const QUARTER_CACHE_MS = 10 * 60 * 1000;

export function createBonusRail({ rosterUrl, teacherKey, fetch = globalThis.fetch, now = Date.now,
  skillTitle = id => id, log = (...args) => console.warn(...args), retryDelayMs = 2000, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const base = String(rosterUrl || '').replace(/\/+$/, '');
  const enabled = !!(base && teacherKey && fetch);
  const quarterCache = { at: 0, quarter: null };
  const posted = [], failed = [];
  const headers = () => ({ 'content-type': 'application/json', 'x-teacher-secret': String(teacherKey) });

  // The open quarter, from roster-server (GET /class/quarter/current, teacher route). Cached.
  async function openQuarter() {
    if (quarterCache.quarter && now() - quarterCache.at < QUARTER_CACHE_MS) return quarterCache.quarter;
    const response = await fetch(base + '/class/quarter/current', { headers: headers() });
    if (!response.ok) throw new Error('quarter lookup HTTP ' + response.status);
    const body = await response.json();
    if (!/^Q[1-4]$/.test(String(body?.quarter || ''))) throw new Error('quarter lookup: no open quarter');
    quarterCache.at = now(); quarterCache.quarter = body.quarter;
    return body.quarter;
  }

  async function postOnce({ username, skillId }) {
    const quarter = await openQuarter();
    const body = { sheetId: 'TI84-' + skillId, title: 'Calculator: ' + skillTitle(skillId), quarter,
      entries: [{ username, grade: 'I' }] };
    const response = await fetch(base + '/class/bonus', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    const reply = await response.json().catch(() => null);
    if (!response.ok || !reply?.ok) throw new Error('POST /class/bonus HTTP ' + response.status + ' ' + JSON.stringify(reply));
    if (reply.written !== 1) throw new Error('POST /class/bonus wrote ' + reply.written + ': ' + JSON.stringify(reply.errors));
    return { ...body, written: reply.written };
  }

  // Fire and forget from the completion hook; returns the promise for tests and the sweep.
  function post(event) {
    const { section, username, skillId } = event || {};
    if (!username || !skillId) return Promise.resolve(null);
    if (!enabled) {
      log('park calculator bonus: ROSTER_TEACHER_KEY not set; mastery not banked for', username, skillId, '(sweep will)');
      return Promise.resolve(null);
    }
    const attempt = () => postOnce({ username, skillId });
    const run = attempt().catch(async error => {
      log('park calculator bonus: first post failed for', username, skillId, error?.message || error, '- retrying once');
      await wait(retryDelayMs);
      return attempt();
    }).then(result => { posted.push({ section, username, skillId, quarter: result.quarter }); return result; })
      .catch(error => {
        failed.push({ section, username, skillId, error: error?.message || String(error) });
        log('park calculator bonus: not banked for', username, skillId, error?.message || error, '(sweep will)');
        return null;
      });
    return run;
  }

  return { enabled, post, openQuarter, posted, failed };
}
