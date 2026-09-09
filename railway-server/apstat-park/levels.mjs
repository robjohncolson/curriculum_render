// Original APStat Park layouts. Definitions are sent on entry, never per frame.
export function createParkLevel(index, members) {
  const titles = ['Build a bridge together', 'Gather the whole sample', 'Pass it on'];
  if (!Number.isInteger(index) || index < 0 || index >= titles.length) {
    throw new Error('Unknown park level');
  }
  const switches = members.map((owner, slot) => ({
    id: `switch-${slot}`, owner, x: 180 + slot * 110, y: 520,
  }));
  const samples = index === 1 ? members.map((owner, slot) => ({
    id: `sample-${slot}`, owner, x: 200 + slot * 110, y: 408,
  })) : index === 2 ? members.map((owner, slot) => ({
    id: `parcel-${slot}`, owner, x: 140 + slot * 110, y: 520,
    destination: switches[(slot + 1) % members.length].id,
  })) : [];
  return {
    id: `park-${index + 1}`, index, title: titles[index], width: 1280, height: 600,
    spawn: { x: 60, y: 520 },
    platforms: [
      { x: 0, y: 540, w: 1000, h: 60 },
      { x: 1100, y: 540, w: 180, h: 60 },
      ...(index === 1 ? [{ x: 160, y: 430, w: 880, h: 18 }] : []),
    ],
    bridge: { x: 1000, y: 540, w: 100, h: 18 },
    switches, samples, goal: { x: 1200, y: 520 },
    hint: index === 2 ? (members.length === 1 ? 'Collect your parcel and deliver it to your switch.' : 'Carry your parcel to the next teammate. Each switch needs its incoming parcel.') : index === 1
      ? 'Collect your sample, then activate your switch. Every contribution stays saved.'
      : 'Activate your switch to help build the bridge. You do not need to arrive at the same time.',
  };
}

export const PARK_LEVEL_COUNT = 3;
