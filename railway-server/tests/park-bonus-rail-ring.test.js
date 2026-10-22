// The bonus rail's posted / failed lists are rings of the last RING entries
// (apstat-park/calculator-bonus.mjs). Review 2026-10-22, "plausible": both arrays grew for the
// life of the process; a relay that runs for months against a flapping roster-server kept every
// failure. The sweep script (scripts/park-bonus-sweep.mjs) is the record, so the rail only needs
// a recent window. The arrays keep their identity (the sweep reads rail.posted / rail.failed).

import { describe, it, expect } from 'vitest';
import { createBonusRail, RING } from '../apstat-park/calculator-bonus.mjs';

function fetchMock({ fail = false } = {}) {
  return async (url, init = {}) => {
    if (fail) throw new Error('roster down');
    if (url.endsWith('/class/quarter/current')) return { ok: true, status: 200, json: async () => ({ ok: true, quarter: 'Q1' }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, written: 1, errors: [] }) };
  };
}

const rail = (opts = {}) => createBonusRail({ rosterUrl: 'https://roster.test', teacherKey: 'k', log() {}, wait: async () => {}, fetch: fetchMock(opts) });

describe('bonus rail posted / failed rings', () => {
  it('RING is 500', () => {
    expect(RING).toBe(500);
  });

  it('posted keeps only the last RING successes, oldest dropped first, same array object', async () => {
    const bonus = rail();
    const posted = bonus.posted;
    for (let i = 0; i < RING + 150; i += 1) {
      await bonus.post({ section: 'PeriodB', username: 'student' + i, skillId: 'one-var-stats' });
    }
    expect(bonus.posted).toBe(posted);
    expect(posted.length).toBe(RING);
    expect(posted[0].username).toBe('student150');
    expect(posted[RING - 1].username).toBe('student' + (RING + 149));
    expect(posted[0]).toEqual({ section: 'PeriodB', username: 'student150', skillId: 'one-var-stats', quarter: 'Q1' });
  });

  it('failed keeps only the last RING failures and every post still resolves null', async () => {
    const bonus = rail({ fail: true });
    const failed = bonus.failed;
    for (let i = 0; i < RING + 20; i += 1) {
      expect(await bonus.post({ section: 'PeriodE', username: 'student' + i, skillId: 'normalcdf' })).toBeNull();
    }
    expect(bonus.failed).toBe(failed);
    expect(failed.length).toBe(RING);
    expect(failed[0].username).toBe('student20');
    expect(failed[RING - 1].username).toBe('student' + (RING + 19));
    expect(failed[0].error).toBe('roster down');
    expect(bonus.posted.length).toBe(0);
  });

  it('below the ring nothing is dropped', async () => {
    const bonus = rail();
    for (let i = 0; i < 3; i += 1) await bonus.post({ section: 'PeriodB', username: 'student' + i, skillId: 'one-var-stats' });
    expect(bonus.posted.map(entry => entry.username)).toEqual(['student0', 'student1', 'student2']);
  });
});
