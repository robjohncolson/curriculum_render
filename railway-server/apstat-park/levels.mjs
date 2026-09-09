// Opening cooperative sequence, adapted to the calendar board's native scale.
// Head boost, gap, bridge switch, key, lift, door. No extracted assets or code.
export const PARK_LEVEL_COUNT = 1;
export const PARK_HOUR_MS = 60 * 60 * 1000;
export const PARK_PROTOCOL = 2;

export function createParkLevel(index = 0) {
  if (index !== 0) throw new Error('Unknown park level');
  return {
    id: 'hello-together-v2', index: 0, protocol: PARK_PROTOCOL,
    title: 'Hello together', width: 960, height: 220,
    spawn: { x: 90, y: 146 }, exit: { x: 43, y: 146 },
    checkpoint: { x: 480, y: 82 },
    platforms: [
      { x: 0, y: 170, w: 300, h: 50 },
      { x: 300, y: 106, w: 100, h: 114 },
      { x: 460, y: 106, w: 140, h: 114 },
      { x: 600, y: 170, w: 250, h: 50 },
      { x: 830, y: 64, w: 130, h: 16 },
    ],
    bridge: { x: 400, y: 106, w: 60, h: 14 },
    // The switch lowers a step so the student who gave the boost can follow.
    step: { x: 260, y: 138, w: 40, h: 32 },
    switches: [{ id: 'bridge', x: 510, y: 82 }], samples: [],
    key: { id: 'key', x: 675, y: 146 },
    lift: { x: 770, w: 60, h: 10, bottom: 170, top: 64, cycleMs: 10000 },
    goal: { x: 910, y: 40 },
  };
}
