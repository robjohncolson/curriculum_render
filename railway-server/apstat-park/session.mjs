import { createParkLevel } from './levels.mjs';

const HISTORY_LIMIT = 128;
const STREAMS_PER_MEMBER = 4;
// Clients send at most every 500 ms; accept from 450 ms so arrival jitter cannot drop good updates.
const MOTION_INTERVAL_MS = 450;
const copy = value => structuredClone(value);
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const inRange = (range, n) => n >= range.min && n <= range.max;
const LEGACY_BODY = { w: 20, h: 24 };

// The relay owns shared milestones, not a continuously simulated world.
// No tick loop, physics snapshots, engine memory or server audio state.
export class ParkSession {
  constructor({ epoch, members = [], levelIndex = 0, now = () => performance.now(), wallNow = () => Date.now() }) {
    requireValue(typeof epoch === 'string' && epoch.length > 0 && epoch.length <= 64, 'Invalid park epoch');
    this.epoch = epoch;
    this.members = [];
    this.now = now;
    this.wallNow = wallNow;
    this.revision = 0;
    this.history = [];
    this.streams = new Map();
    this.nextStreamId = 1;
    this.poses = new Map();
    this.online = [];
    this.running = false;
    this.clockBase = this.now(); this.pausedAt = this.clockBase; this.pausedMs = 0;
    this.holds = new Map();
    this.pushes = new Map();
    this.done = false;
    this.lastActive = new Map();
    this.level = createParkLevel(levelIndex);
    this.attempt = 1;
    this.progress = this.emptyProgress();
    for (const member of members) this.addMember(member);
  }

  addMember(member) {
    requireValue(typeof member === 'string' && member.length > 0 && member.length <= 80, 'Invalid park member');
    if (this.members.includes(member)) return [];
    requireValue(this.members.length < 64, 'This classroom park is full');
    this.members.push(member);
    return [this.emit('members', { members: this.members })];
  }

  // Protocol-5 levels (level 6) are party-aware: party size changes geometry and lift thresholds.
  get partyAware() { return this.level.minProtocol >= 5; }

  // Party = online members who have not arrived; clients compute the same from online/arrived.
  party() { return this.online.filter(member => !this.progress.arrived.includes(member)); }

  // Active party also leaves out idle members, so an AFK student cannot hold the lift down.
  activeParty() { return this.party().filter(member => !(this.progress.idle ?? []).includes(member)); }

  emptyProgress() {
    const extra = {};
    // Latch switches stay pressed; the value is the scene clock (ms) at which each latched.
    if (this.level.switches.some(item => item.latch)) extra.latches = {};
    if (this.level.idleMs) extra.idle = [];
    return { switches: [], arrived: [], bridgeOpen: false, keyHolder: null, doorOpen: false, complete: false,
      holds: {}, gates: [], ...extra,
      boxes: Object.fromEntries(this.level.boxes.map(box => {
        const point = box.nodes[box.start];
        return [box.id, { from: point, to: point, at: this.sceneClock(), duration: 0, node: box.start }];
      })),
      lifts: Object.fromEntries(this.level.weightedLifts.map(lift => {
        const y = lift.descend ? lift.top : lift.rest ?? lift.bottom;
        return [lift.id, { from: y, to: y, at: this.sceneClock(), duration: 0 }];
      }))
    };
  }

  open(member, clientId, activeKeys = null) {
    requireValue(this.members.includes(member), 'Park membership required');
    requireValue(typeof clientId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(clientId), 'Invalid park client');
    const key = JSON.stringify([member, clientId]);
    if (!this.streams.has(key)) {
      const count = [...this.streams.values()].filter(stream => stream.member === member).length;
      if (count >= STREAMS_PER_MEMBER) {
        const inactive = activeKeys && [...this.streams].find(([id, stream]) => stream.member === member && !activeKeys.has(id));
        requireValue(inactive, 'Close another park tab before joining here');
        this.streams.delete(inactive[0]);
      }
      this.streams.set(key, { id: this.nextStreamId++, member, clientId, sequence: 0, receipts: [], motionSequence: 0, lastMotionAt: -Infinity });
    }
    return key;
  }

  stream(key) {
    const stream = this.streams.get(key);
    requireValue(stream, 'Join this park session first');
    return stream;
  }

  emit(kind, payload) {
    const event = { epoch: this.epoch, revision: ++this.revision, kind, ...copy(payload) };
    this.history.push(event);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    return copy(event);
  }

  setOnline(members) {
    const online = this.members.filter(member => members.includes(member));
    if (JSON.stringify(online) === JSON.stringify(this.online)) return [];
    for (const member of online) if (!this.online.includes(member)) this.lastActive.set(member, this.now());
    this.online = online;
    const events = [this.emit('presence', { online })];
    if (this.progress.keyHolder && !online.includes(this.progress.keyHolder) && !this.progress.doorOpen) {
      this.progress.keyHolder = null;
      events.push(this.emit('key', { holder: null }));
    }
    events.push(...this.adaptParty(), ...this.expireHolds(), ...this.checkCompletion());
    return events;
  }

  checkCompletion() {
    // Idle members (protocol-5 levels only) who have not arrived do not block the others.
    const idle = this.progress.idle ?? [];
    const active = this.online.filter(member => this.progress.arrived.includes(member) || !idle.includes(member));
    const complete = this.progress.complete || active.length >= this.level.minPlayers && active.every(member => this.progress.arrived.includes(member));
    if (complete === this.progress.complete) return [];
    this.progress.complete = complete;
    return [this.emit('complete', { complete })];
  }

  adaptParty() {
    const running = this.online.length >= this.level.minPlayers;
    if (running === this.running) return [];
    if (running) { this.pausedMs += this.now() - this.pausedAt; this.pausedAt = null; }
    else this.pausedAt = this.now();
    this.running = running;
    return [this.emit('running', { running, clockMs: this.sceneClock() }), ...this.refreshMechanisms()];
  }

  sceneClock() { return (this.running ? this.now() : this.pausedAt) - this.clockBase - this.pausedMs; }

  valueAt(state) {
    const t = state.duration ? Math.min(1, Math.max(0, (this.sceneClock() - state.at) / state.duration)) : 1;
    if (typeof state.from === 'number') return state.from + (state.to - state.from) * t;
    return { x: state.from.x + (state.to.x - state.from.x) * t, y: state.from.y + (state.to.y - state.from.y) * t };
  }

  heldState() {
    const result = {};
    for (const { member, target } of this.holds.values()) {
      if (!result[target]) result[target] = [];
      if (!result[target].includes(member)) result[target].push(member);
    }
    return result;
  }

  expireHolds() {
    let changed = false;
    for (const [key, held] of this.holds) {
      if (!this.running || !this.online.includes(held.member) || this.progress.arrived.includes(held.member) || this.now() >= held.until) {
        this.holds.delete(key); changed = true;
      }
    }
    const events = [];
    if (changed) {
      this.progress.holds = this.heldState();
      this.progress.switches = Object.keys(this.progress.holds);
      events.push(this.emit('holds', { holds: this.progress.holds }));
    }
    for (const [id, push] of this.pushes) {
      if (!this.running || !this.online.includes(push.member) || this.now() >= push.until) {
        this.pushes.delete(id);
        const state = this.progress.boxes[id], point = this.valueAt(state);
        this.progress.boxes[id] = { ...state, from: point, to: point, at: this.sceneClock(), duration: 0 };
        events.push(this.emit('box', { id, state: this.progress.boxes[id] }));
      }
    }
    return [...events, ...this.refreshMechanisms(), ...this.refreshIdle()];
  }

  // An online member with no accepted motion or command for level.idleMs is idle.
  refreshIdle() {
    if (!this.level.idleMs) return [];
    const at = this.now();
    const idle = this.online.filter(member => !this.progress.arrived.includes(member)
      && at - (this.lastActive.get(member) ?? at) >= this.level.idleMs).sort();
    if (JSON.stringify(idle) === JSON.stringify(this.progress.idle)) return [];
    this.progress.idle = idle;
    return [this.emit('idle', { idle }), ...this.refreshMechanisms(), ...this.checkCompletion()];
  }

  refreshMechanisms(force = false) {
    const p = this.progress, at = this.sceneClock(), party = this.party().length;
    // gate.party forces a gate open while the party size is in range (level 6: full bridge when alone).
    const gates = this.level.gates.filter(gate => gate.party && inRange(gate.party, party) || (gate.latch
      ? gate.latch.some(id => p.latches?.[id] != null)
      : gate.holds ? gate.holds.some(id => (p.holds[id] || []).length)
      : gate.boxes.every(id => {
        const box = this.level.boxes.find(box => box.id === id), state = p.boxes[id];
        const point = this.valueAt(state), dock = box.nodes.at(-1);
        return Math.hypot(point.x-dock.x,point.y-dock.y)<1;
      }))).map(gate => gate.id);
    let changed = force || JSON.stringify(gates) !== JSON.stringify(p.gates);
    p.gates = gates;
    p.bridgeOpen = gates.includes('bridge');
    for (const lift of this.level.weightedLifts) {
      if (lift.perParty) { changed = this.refreshPartyLift(lift, at) || changed; continue; }
      const riders = (p.holds[lift.id] || []).length;
      // Four riders fit the board-sized shelter; larger classes take turns.
      const half = Math.max(1, Math.min(4, Math.ceil(this.online.length / 2)));
      // Party-scaled lifts need min(authored, party) riders, so a lone student can ride alone.
      const min = lift.minRiders === 'half' ? half : lift.partyScaled ? Math.max(1, Math.min(lift.minRiders, party)) : lift.minRiders;
      const max = lift.maxRiders === 'half' ? half : lift.maxRiders || 64;
      const active = riders >= min && riders <= max;
      const state = p.lifts[lift.id], current = this.valueAt(state);
      const target = !this.running ? current : lift.descend
        ? active ? lift.bottom : lift.top : active ? lift.top : lift.home ?? lift.bottom;
      if (Math.abs(target - state.to) < 0.01) continue;
      p.lifts[lift.id] = { from: current, to: target, at, duration: Math.abs(target-current) / (lift.speed || 35) * 1000 };
      changed = true;
    }
    const latches = p.latches ? { latches: p.latches } : {};
    return changed ? [this.emit('mechanisms', { gates: p.gates, lifts: p.lifts, bridgeOpen: p.bridgeOpen, ...latches })] : [];
  }

  // Level 6 lift: n = min(cap, active party) riders raise it by travelBase + travelPer*n at `speed`;
  // otherwise it descends to home at descentBase + descentPer*n px/s. Live 'lift-under' leases stop
  // the descent at the highest reported head; it resumes resumeMs after the last lease ends.
  refreshPartyLift(lift, at) {
    const p = this.progress, rule = lift.perParty, state = p.lifts[lift.id], current = this.valueAt(state);
    const n = Math.max(1, Math.min(rule.cap, this.activeParty().length));
    const top = lift.rest - (rule.travelBase + rule.travelPer * n);
    let to = !this.running ? current : (p.holds[lift.id] || []).length >= n ? top : lift.home;
    const heads = [...this.holds.values()].filter(held => held.target === lift.blockId).map(held => held.y);
    const blocked = this.running && to > current && heads.length > 0 && Math.min(...heads) - lift.h < to;
    if (blocked) to = Math.min(...heads) - lift.h;
    const from = blocked && to < current ? to : current;   // never stay inside a head that was reported late
    const rate = to < from ? lift.speed : rule.descentBase + rule.descentPer * n;
    if (Math.abs(to - state.to) < 0.01 && state.rate === rate && !!state.blocked === blocked && Math.abs(from - current) < 0.01) return false;
    const resume = state.blocked && !blocked ? lift.resumeMs || 0 : 0;
    p.lifts[lift.id] = { from, to, at: at + resume, duration: Math.abs(to - from) / rate * 1000, rate, ...(blocked ? { blocked: true } : {}) };
    return true;
  }

  resetAttempt() {
    this.level = createParkLevel(this.level.index);
    this.level.id += '-attempt-' + ++this.attempt;
    this.clockBase = this.now(); this.pausedMs = 0; this.pausedAt = this.running ? null : this.now();
    this.holds.clear(); this.pushes.clear(); this.progress = this.emptyProgress(); this.poses.clear();
    for (const member of this.online) this.lastActive.set(member, this.now());
    return [this.emit('level', { level: this.level, progress: this.progress, clockMs: this.sceneClock() })];
  }

  enter(member) {
    // Explicit doorway entry starts a fresh completed attempt. Socket resumes
    // never call this, so a connection drop cannot reset anyone's puzzle.
    if (this.progress.complete) return this.resetAttempt();
    if (!this.progress.arrived.includes(member)) return [];
    this.progress.arrived = this.progress.arrived.filter(name => name !== member);
    this.poses.delete(member);
    this.lastActive.set(member, this.now());
    const events = [this.emit('reentered', { member })];
    return this.partyAware ? [...events, ...this.refreshMechanisms(), ...this.refreshIdle()] : events;
  }

  // No hourly timer or forced reset mid-puzzle. A status/join advances only
  // after everyone still here has finished (with celebration time), or the room empties.
  // Levels 0-5 keep their attempt indefinitely. Level 6 resets a room that has been empty
  // for the service's ABANDON_MS, so a stranded attempt (stale saved spots) cannot persist.
  rotateIfReady({ empty = false, abandoned = false } = {}) {
    if (abandoned && this.level.resetWhenAbandoned && !this.online.length) return this.resetAttempt();
    return [];
  }

  validPose(pose) {
    return pose && ['x', 'y', 'vx', 'vy'].every(key => Number.isFinite(pose[key]))
      && pose.x >= 0 && pose.x <= this.level.width && pose.y >= -this.level.height && pose.y <= this.level.height
      && Math.abs(pose.vx) <= 400 && Math.abs(pose.vy) <= 1200;
  }

  motion(key, packet) {
    const stream = this.stream(key);
    if (packet?.epoch !== this.epoch || packet.level !== this.level.id || !this.running || this.done) return null;
    if (!Number.isSafeInteger(packet.sequence) || packet.sequence <= stream.motionSequence || !this.validPose(packet.pose)) return null;
    const at = this.now();
    if (at - stream.lastMotionAt < MOTION_INTERVAL_MS) return null;
    stream.motionSequence = packet.sequence;
    stream.lastMotionAt = at;
    this.lastActive.set(stream.member, at);
    const pose = Object.fromEntries(['x', 'y', 'vx', 'vy'].map(key => [key, Math.round(packet.pose[key] * 10) / 10]));
    this.poses.set(stream.member, pose);
    // Deliberately ephemeral: no revision/history, no movement backlog on resume.
    return { epoch: this.epoch, kind: 'motion', level: this.level.id, member: stream.member, pose };
  }

  command(key, packet) {
    const stream = this.stream(key);
    requireValue(packet?.epoch === this.epoch, 'Park session changed');
    requireValue(Number.isSafeInteger(packet.sequence) && packet.sequence > 0, 'Invalid command sequence');
    if (packet.sequence <= stream.sequence) {
      const receipt = stream.receipts.find(row => row.sequence === packet.sequence);
      return { ...receipt, status: 'duplicate', outcome: receipt?.status ?? 'unknown', sequence: packet.sequence, revision: this.revision, events: [] };
    }
    if (packet.sequence !== stream.sequence + 1) return { status: 'gap', sequence: stream.sequence, revision: this.revision, events: [] };
    // Consume rejected commands too, so one stale action cannot block the outbox.
    stream.sequence = packet.sequence;
    this.lastActive.set(stream.member, this.now());
    const finish = (status, events = [], reason) => {
      const receipt = { status, sequence: packet.sequence, revision: this.revision, ...(reason ? { reason } : {}) };
      stream.receipts.push(receipt);
      if (stream.receipts.length > 16) stream.receipts.shift();
      return { ...receipt, events };
    };
    const reject = reason => finish('rejected', [], reason);
    if (packet.level !== this.level.id) return reject('Level changed');
    if ((!this.running && packet.kind !== 'settle') || this.done) return reject(this.level.minPlayers === 2 ? 'Wait for at least two players' : 'Wait for the park to start');
    if (!this.validPose(packet.pose)) return reject('Invalid position');
    const reach = this.level.reach ?? 24, body = this.level.body ?? LEGACY_BODY;
    const near = item => Math.hypot(packet.pose.x - item.x, packet.pose.y - item.y) <= reach;
    let event;
    if (packet.kind === 'settle') {
      if (packet.pose.vx !== 0 || packet.pose.vy !== 0) return reject('A resting anchor must be stationary');
      this.poses.set(stream.member, copy(packet.pose));
      event = this.emit('settled', { member: stream.member, pose: packet.pose });
    } else if (packet.kind === 'hold' || packet.kind === 'switch') {
      const pad = this.level.switches.find(item => item.id === packet.target);
      const lift = this.level.weightedLifts.find(item => item.id === packet.target);
      const under = this.level.weightedLifts.find(item => item.blockId && item.blockId === packet.target);
      if (!pad && !lift && !under) return reject('Unknown pressure surface');
      // The original switch command is a pressure-down intent, never a permanent latch.
      const active = packet.kind === 'switch' ? true : packet.active;
      if (typeof active !== 'boolean') return reject('Invalid pressure state');
      if (active && this.progress.arrived.includes(stream.member)) return reject('Leave the exit before helping');
      // A stacking lift also accepts riders standing k bodies above its surface (on teammates),
      // with the stack allowed to drift `slack` px sideways per level.
      let onLift = false;
      if (lift) {
        const surface = this.valueAt(this.progress.lifts[lift.id]), feet = packet.pose.y + body.h;
        const level = lift.stack ? Math.min(lift.stack.max, Math.max(0, Math.round((surface - feet) / body.h))) : 0;
        const slack = level * (lift.stack?.slack ?? 0);
        onLift = packet.pose.x + body.w > lift.x - slack && packet.pose.x < lift.x + lift.w + slack
          && Math.abs(feet + level * body.h - surface) < 16;
      }
      // Under-lift lease: the body is within the lift's span and its head is below the lift surface.
      const beneath = under && packet.pose.x + body.w > under.x && packet.pose.x < under.x + under.w
        && packet.pose.y >= this.valueAt(this.progress.lifts[under.id]) - 2;
      if (active && !(pad ? near(pad) : lift ? onLift : beneath)) return reject('Stand on the pressure surface');
      if (pad?.latch) {
        // A latch switch is pressed once and stays down; release and renewals are no-ops.
        if (!active || this.progress.latches[pad.id] != null) return finish('accepted');
        this.progress.latches[pad.id] = this.sceneClock();
        return finish('accepted', this.refreshMechanisms(true));
      }
      const holdKey = JSON.stringify([stream.member, packet.target]);
      if (active) this.holds.set(holdKey, { member: stream.member, target: packet.target, until: this.now() + 6000, ...(under ? { y: packet.pose.y } : {}) });
      else this.holds.delete(holdKey);
      const holds = this.heldState(), events = [];
      if (JSON.stringify(holds) !== JSON.stringify(this.progress.holds)) {
        this.progress.holds = holds; this.progress.switches = Object.keys(holds); events.push(this.emit('holds', { holds }));
      }
      return finish('accepted', [...events, ...this.refreshMechanisms()]);
    } else if (packet.kind === 'push') {
      const box = this.level.boxes.find(item => item.id === packet.target);
      if (!box || ![-1,0,1].includes(packet.direction)) return reject('Invalid push');
      const state = this.progress.boxes[box.id], point = this.valueAt(state), active = this.pushes.get(box.id);
      if (packet.direction === 0) {
        if (!active || active.member !== stream.member) return finish('accepted');
        this.pushes.delete(box.id);
        this.progress.boxes[box.id] = { ...state, from: point, to: point, at: this.sceneClock(), duration: 0 };
        return finish('accepted', [this.emit('box', { id: box.id, state: this.progress.boxes[box.id] }), ...this.refreshMechanisms()]);
      }
      if (active && active.member !== stream.member && active.direction !== packet.direction) return reject('A friend is pushing from the other side');
      const next = packet.direction === 1 ? box.nodes.findIndex(node => node.x > point.x + 0.1)
        : box.nodes.findLastIndex(node => node.x < point.x - 0.1);
      if (next < 0) return finish('accepted');
      const side = packet.direction === 1 ? Math.abs(packet.pose.x + 20 - point.x) : Math.abs(packet.pose.x - point.x - box.w);
      if (side > 18 || packet.pose.y + 24 < point.y - 2 || packet.pose.y > point.y + box.h) return reject('Push from beside the block');
      if (box.requires && !this.progress.gates.includes(box.requires)) return reject('A friend must hold the bridge button');
      this.pushes.set(box.id, { member: stream.member, direction: packet.direction, until: this.now() + 6000 });
      if (this.sceneClock() < state.at + state.duration && active?.direction === packet.direction) return finish('accepted');
      const to = box.nodes[next];
      this.progress.boxes[box.id] = { from: point, to, node: next, at: this.sceneClock(), duration: Math.hypot(to.x-point.x,to.y-point.y) / 65 * 1000 };
      return finish('accepted', [this.emit('box', { id: box.id, state: this.progress.boxes[box.id] }), ...this.refreshMechanisms()]);
    } else if (packet.kind === 'retry') {
      return finish('accepted', this.resetAttempt());
    } else if (packet.kind === 'key') {
      if (!near(this.level.key)) return reject('Reach the key');
      if (this.level.boxes.some(box => { const p = this.valueAt(this.progress.boxes[box.id]); return this.level.key.x + 10 > p.x && this.level.key.x < p.x + box.w && this.level.key.y + 18 > p.y && this.level.key.y < p.y + box.h; })) return reject('Move the block covering the key');
      if (this.progress.doorOpen || this.progress.keyHolder === stream.member) return finish('accepted');
      if (this.progress.keyHolder) return reject('A friend is carrying the key');
      this.progress.keyHolder = stream.member;
      event = this.emit('key', { holder: stream.member });
    } else if (packet.kind === 'unlock') {
      if (!near(this.level.goal)) return reject('Bring the key to the door');
      if (this.progress.doorOpen) return finish('accepted');
      if (this.progress.keyHolder !== stream.member) return reject('The key holder opens the door');
      this.progress.doorOpen = true;
      event = this.emit('door', { open: true });
    } else if (packet.kind === 'arrive') {
      if (!this.progress.doorOpen || !near(this.level.goal)) return reject('Open the door, then enter it');
      if (this.progress.arrived.includes(stream.member)) return finish('accepted');
      this.progress.arrived.push(stream.member);
      event = this.emit('arrived', { member: stream.member, complete: this.progress.arrived.length === this.members.length });
      // Arrival shrinks the party: holds drop now, and stairs/bridge/lift threshold follow.
      if (this.partyAware) return finish('accepted', [event, ...this.expireHolds(), ...this.checkCompletion()]);
    } else return reject('Unknown park action');
    return finish('accepted', [event, ...this.checkCompletion()]);
  }

  resume(key, since = null) {
    const stream = this.stream(key);
    const common = { epoch: this.epoch, clockMs: this.sceneClock(), streamId: stream.id, revision: this.revision, sequence: stream.sequence, receipts: copy(stream.receipts) };
    const first = this.history[0]?.revision ?? this.revision + 1;
    if (Number.isSafeInteger(since) && since >= first - 1 && since <= this.revision) {
      return { ...common, mode: 'events', events: copy(this.history.filter(event => event.revision > since)), poses: copy(Object.fromEntries(this.poses)) };
    }
    return {
      ...common, mode: 'summary', members: [...this.members], online: [...this.online], running: this.running, done: this.done,
      level: copy(this.level), progress: copy(this.progress), poses: copy(Object.fromEntries(this.poses)),
    };
  }
}
