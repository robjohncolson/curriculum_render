// Original shared puzzles. Stations belong to the room, never to an absent player.
export const PARK_LEVEL_COUNT = 3;
export const PARK_HOUR_MS = 60 * 60 * 1000;

export function createParkLevel(index, hour = 0) {
  const titles = ['Build a bridge together', 'Gather the whole sample', 'Pass it on'];
  if (!Number.isInteger(index) || index < 0 || index >= titles.length) throw new Error('Unknown park level');
  const switches = Array.from({ length: 4 }, (_, slot) => ({
    id: 'switch-' + slot, label: String(slot + 1), x: 220 + slot * 210, y: 520,
  }));
  const samples = index === 0 ? [] : switches.map((station, slot) => ({
    id: 'sample-' + slot, label: String(slot + 1), x: index === 1 ? station.x : 140 + slot * 210,
    y: index === 1 ? 408 : 520,
    destination: switches[index === 2 ? (slot + 1) % switches.length : slot].id,
  }));
  return {
    id: 'park-' + hour + '-' + index, index, title: titles[index], rotationAt: (hour + 1) * PARK_HOUR_MS,
    width: 1280, height: 600, spawn: { x: 85, y: 520 }, checkpoint: { x: 955, y: 520 },
    exit: { x: 40, y: 520 },
    platforms: [
      { x: 0, y: 540, w: 1000, h: 60 },
      { x: 1120, y: 540, w: 160, h: 60 },
      ...(index === 1 ? [{ x: 175, y: 430, w: 730, h: 18 }] : []),
    ],
    bridge: { x: 1000, y: 540, w: 120, h: 18 },
    switches, samples, goal: { x: 1210, y: 520 },
    hint: index === 0 ? 'Light four switches to build the bridge. Anyone can help.'
      : index === 1 ? 'Collect samples above, then deliver them to matching numbered stations.'
      : 'Collect parcels and take them to their numbered stations. Share the work!',
  };
}
