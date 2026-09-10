// Opening cooperative sequence, adapted to the calendar board's native scale.
// Head boost, gap, bridge switch, key, lift, door. No extracted assets or code.
export const PARK_LEVEL_COUNT = 3;
export const PARK_HOUR_MS = 60 * 60 * 1000;
export const PARK_PROTOCOL = 3;

export function createParkLevel(index = 0) {
  if (!Number.isInteger(index) || index < 0 || index >= PARK_LEVEL_COUNT) throw new Error('Unknown park level');
  if (index > 0) return createSwitchLevel(index);
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

// Latched switches let friends split the route without requiring synchronized packets.
function createSwitchLevel(index) {
  const relay = index === 2;
  return {
    id: relay ? 'lift-relay-v3' : 'switchback-v3', index, protocol: PARK_PROTOCOL,
    title: relay ? 'Lift relay' : 'Switchback', width: 960, height: 220,
    spawn: { x: 90, y: 146 }, exit: { x: 43, y: 146 },
    checkpoint: { x: 620, y: 146 },
    platforms: relay ? [
      { x: 0, y: 170, w: 400, h: 50 },
      { x: 460, y: 170, w: 500, h: 50 },
      { x: 180, y: 134, w: 90, h: 12 },
      { x: 280, y: 98, w: 100, h: 12 },
      { x: 490, y: 64, w: 170, h: 12 },
      { x: 690, y: 100, w: 100, h: 12 },
      { x: 830, y: 64, w: 130, h: 16 }
    ] : [
      { x: 0, y: 170, w: 400, h: 50 },
      { x: 460, y: 170, w: 390, h: 50 },
      { x: 180, y: 134, w: 90, h: 12 },
      { x: 280, y: 98, w: 100, h: 12 },
      { x: 510, y: 134, w: 100, h: 12 },
      { x: 830, y: 64, w: 130, h: 16 }
    ],
    bridge: { x: 400, y: 170, w: 60, h: 14 },
    step: { x: 720, y: 138, w: 40, h: 32 },
    switches: relay ? [
      { id: 'low', x: 210, y: 110 }, { id: 'high', x: 320, y: 74 },
      { id: 'far', x: 530, y: 40 }
    ] : [{ id: 'high', x: 320, y: 74 }, { id: 'far', x: 550, y: 110 }],
    samples: [], key: relay ? { id: 'key', x: 635, y: 40 } : { id: 'key', x: 675, y: 146 },
    lift: { x: relay ? 420 : 770, w: 60, h: 10, bottom: 170, top: 64, cycleMs: 10000 },
    goal: { x: 910, y: 40 }, requiresSwitches: true
  };
}
