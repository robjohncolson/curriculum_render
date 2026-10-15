// Shared with the relay. Positions are in the continuous 1440px calculator world.
export const TEAM_BLOCK = { start: 400, dock: 1060, y: 668, w: 32, h: 32, speed: 60 };
// 9 (2026-10-10): interpretation answers may be category keys, lastPlot carries feedback,
// and the catalog's quartiles/bins changed; an older page must reload, not mis-judge.
// 10 (2026-10-12, APSTAT_PARK_CALCULATOR_FLUENCY_SPEC): calculator_state carries clears/rung, the
// round's random data (problem) and wrong-key presses (lastPress.wrong/penaltyMs).
// 11 (2026-10-12): the randIntNoRep skills are templated per round, so problem carries the round's
// route and hints (an older client would replay the catalogue route against the new numbers).
// 12 (2026-10-15, APSTAT_PARK_TRAINER_ABSORB_SPEC §3): the solo room. calculator_join carries
// mode: 'solo' and an optional skill; calculator_state and calculator_lobby_state carry mode and
// pinnedSkill. A solo round has a roster of one and no team block.
// 13 (2026-10-15, Codex review R1): a solo join with no playable skill is answered with
// calculator_lobby_state phase 'waiting' (epoch null), which the client treats as a terminal
// reset of its round; a protocol-12 page kept stale round state and showed reconnect copy.
export const CALCULATOR_PROTOCOL = 13;

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
