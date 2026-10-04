// Shared with the relay. Positions are in the continuous 1440px calculator world.
export const TEAM_BLOCK = { start: 400, dock: 1060, y: 668, w: 32, h: 32, speed: 60 };
export const CALCULATOR_PROTOCOL = 7;

export function createLobby(now) {
  return { phase: 'gathering', x: TEAM_BLOCK.start, pushers: [], roster: [], members: new Map(), lastTick: now };
}

export function pushersFor(lobby, now) {
  const candidates = [...lobby.members].filter(([, member]) =>
    now - member.at < 350 && member.pushing && Math.abs(member.pose.y - 676) <= 3
    && member.pose.x <= lobby.x).sort((a, b) => b[1].pose.x - a[1].pose.x);
  const names = [];
  let contact = lobby.x;
  for (const [name, member] of candidates) {
    const right = member.pose.x + 20;
    if (right < contact - 24 || right > lobby.x + 4) continue;
    names.push(name);
    contact = Math.min(contact, member.pose.x);
  }
  return names;
}

export function advanceLobby(lobby, now) {
  const dt = Math.max(0, Math.min(0.2, (now - lobby.lastTick) / 1000));
  lobby.lastTick = now;
  if (lobby.phase !== 'gathering') return false;
  lobby.pushers = pushersFor(lobby, now);
  if (!lobby.pushers.length) return false;
  lobby.x = Math.min(TEAM_BLOCK.dock, lobby.x + TEAM_BLOCK.speed * dt);
  if (lobby.x < TEAM_BLOCK.dock) return false;
  lobby.roster = lobby.pushers.slice();
  lobby.phase = 'assembling';
  // Everyone must see the full keypad before a shared starting clock begins.
  for (const member of lobby.members.values()) member.ready = false;
  return true;
}
