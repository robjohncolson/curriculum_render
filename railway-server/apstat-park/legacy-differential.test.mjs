import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkSession as Frozen } from './fixtures/v4-session.mjs';
import { ParkSession } from './session.mjs';

// Regression guard: levels 0-5 must behave exactly like the pre-level-6 relay (fixtures/ are
// verbatim copies of session.mjs/levels.mjs at 525c4bc). A seeded stream of commands, motion,
// presence changes, entries and clock advances must give identical results from both.
const strip = value => JSON.parse(JSON.stringify(value, (key, x) => (['minProtocol', 'minPlayers', 'physics'].includes(key) ? undefined : x)));

test('levels 0-5 match the frozen protocol-4 relay on a seeded fuzz', () => {
  let seed = 1, ops = 0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(rnd() * list.length)];
  for (let run = 0; run < 240; run++) {
    const levelIndex = run % 6, members = ['a', 'b', 'c', 'd'];
    let t = 0;
    const sessions = [Frozen, ParkSession].map(C => new C({ epoch: 'e', levelIndex, members, now: () => t }));
    const keys = sessions.map(s => Object.fromEntries(members.map(m => [m, s.open(m, 'browser_' + m)])));
    const seq = {}, lvl = sessions[0].level;
    const targets = [...lvl.switches.map(s => s.id), ...lvl.weightedLifts.map(l => l.id), ...lvl.boxes.map(b => b.id), 'nope', 'lift-under'];
    const anchors = [lvl.key, lvl.goal, lvl.spawn, ...lvl.switches, ...lvl.boxes.flatMap(b => b.nodes),
      ...lvl.weightedLifts.flatMap(l => [{ x: l.x + 5, y: l.bottom - 24 }, { x: l.x + 5, y: l.top - 24 }])];
    for (let i = 0; i < 300; i++) {
      const r = rnd();
      let call;
      if (r < 0.08) { const on = members.filter(() => rnd() < 0.7); call = s => s.setOnline(on); }
      else if (r < 0.2) { t += Math.floor(rnd() * 3000); call = s => s.expireHolds(); }
      else if (r < 0.35) {
        const m = pick(members), a = pick(anchors);
        const y = rnd() < 0.2 ? -100 - rnd() * 150 : a.y + (rnd() - 0.5) * 30;
        const packet = { epoch: 'e', sequence: Math.floor(rnd() * 1e6), pose: { x: a.x + (rnd() - 0.5) * 30, y, vx: 0, vy: 0 } };
        call = (s, k) => s.motion(k[m], { ...packet, level: s.level.id });
      } else if (r < 0.38) { const m = pick(members); call = s => s.enter(m); }
      else {
        const m = pick(members), a = pick(anchors);
        const kind = pick(['settle', 'hold', 'switch', 'push', 'key', 'unlock', 'arrive', 'hold', 'hold', 'arrive', 'retry', 'bogus']);
        if (kind === 'retry' && rnd() < 0.8) continue;
        const sequence = (seq[m] = (seq[m] || 0) + 1);
        const pose = { x: a.x + (rnd() - 0.5) * 20, y: rnd() < 0.1 ? -150 : a.y + (rnd() - 0.5) * 20, vx: rnd() < 0.8 ? 0 : 5, vy: 0 };
        const extra = { target: pick(targets), active: rnd() < 0.7, direction: pick([-1, 0, 1]) };
        call = (s, k) => s.command(k[m], { epoch: 'e', level: s.level.id, sequence, kind, pose, ...extra });
      }
      if (rnd() < 0.3) t += Math.floor(rnd() * 700);
      const [before, after] = sessions.map((s, j) => { try { return JSON.stringify(strip(call(s, keys[j]))); } catch (error) { return 'THROW ' + error.message; } });
      ops++;
      assert.equal(after, before, `level ${levelIndex}, run ${run}, op ${i}`);
    }
    assert.deepEqual(strip(sessions[1].progress), strip(sessions[0].progress));
  }
  assert.ok(ops > 60000);
});
