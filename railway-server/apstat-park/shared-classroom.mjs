import { eligibleLevels } from './calculator-curriculum.mjs';

export const SHARED_PARK = 'park:periods-b-e';
const SHARED_CLASSES = ['PeriodB', 'PeriodE', 'B', 'E'];
export const parkSection = section => SHARED_CLASSES.includes(section) ? SHARED_PARK : section;

// This adapter belongs only to the park services. The actual classroom registry,
// its socket identities, polls, grades and teacher commands remain class-scoped.
export function createParkRegistry(classrooms) {
  return {
    _wsEntry(ws) {
      const entry = classrooms._wsEntry(ws);
      // The shared key is internal; clients cannot join it as a classroom.
      if (!entry || entry.section === SHARED_PARK) return null;
      const member = classrooms.stateFor(entry.section, 'student', entry.username)?.members
        .find(member => member.username === entry.username);
      if (!member || member.online === false) return null;
      return { ...entry, classroomSection: entry.section, section: parkSection(entry.section) };
    },
    stateFor(section) {
      const sections = section === SHARED_PARK ? SHARED_CLASSES : [section];
      const members = new Map();
      for (const source of sections) {
        for (const member of classrooms.stateFor(source, 'student')?.members || []) {
          const previous = members.get(member.username);
          if (previous?.online && !member.online) continue;
          const { username, role, online, hue, pos } = member;
          members.set(username, { username, role, online, hue, pos });
        }
      }
      return { members: [...members.values()] };
    },
  };
}

// A shared calculator mission must already be taught in both classes.
export function eligibleParkLevels(section, date, available = eligibleLevels) {
  if (section !== SHARED_PARK) return available(section, date);
  const periodE = new Set(available('PeriodE', date).map(level => level.id));
  return available('PeriodB', date).filter(level => periodE.has(level.id));
}
