import { createParkLevel } from './levels.mjs';

const HISTORY_LIMIT = 128;
const STREAMS_PER_MEMBER = 4;
const MOTION_INTERVAL_MS = 500;
const copy = value => structuredClone(value);
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

// The relay owns shared milestones, not a continuously simulated world.
// No tick loop, physics snapshots, engine memory or server audio state.
export class ParkSession {
  constructor({ epoch, members = [], now = () => performance.now(), wallNow = () => Date.now() }) {
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
    this.running = true;
    this.done = false;
    this.level = createParkLevel();
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

  emptyProgress() {
    return { switches: [], arrived: [], bridgeOpen: false,
      keyHolder: null, doorOpen: false, complete: false };
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
    this.online = online;
    const events = [this.emit('presence', { online })];
    if (this.progress.keyHolder && !online.includes(this.progress.keyHolder) && !this.progress.doorOpen) {
      this.progress.keyHolder = null;
      events.push(this.emit('key', { holder: null }));
    }
    events.push(...this.checkCompletion());
    return events;
  }

  checkCompletion() {
    const complete = this.online.length > 0 && this.online.every(member => this.progress.arrived.includes(member));
    if (complete === this.progress.complete) return [];
    this.progress.complete = complete;
    return [this.emit('complete', { complete })];
  }

  // No hourly timer or forced reset mid-puzzle. A status/join advances only
  // after everyone still here has finished (with celebration time), or the room empties.
  rotateIfReady({ empty = false } = {}) {
    // Keep the first level stable while students learn it. No hourly reset.
    return [];
  }

  validPose(pose) {
    return pose && ['x', 'y', 'vx', 'vy'].every(key => Number.isFinite(pose[key]))
      && pose.x >= 0 && pose.x <= this.level.width && pose.y >= -100 && pose.y <= this.level.height
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
    const finish = (status, events = [], reason) => {
      const receipt = { status, sequence: packet.sequence, revision: this.revision, ...(reason ? { reason } : {}) };
      stream.receipts.push(receipt);
      if (stream.receipts.length > 16) stream.receipts.shift();
      return { ...receipt, events };
    };
    const reject = reason => finish('rejected', [], reason);
    if (packet.level !== this.level.id) return reject('Level changed');
    if (!this.running || this.done) return reject('The park is not running');
    if (!this.validPose(packet.pose)) return reject('Invalid position');
    const near = item => Math.hypot(packet.pose.x - item.x, packet.pose.y - item.y) <= 24;
    let event;
    if (packet.kind === 'settle') {
      if (packet.pose.vx !== 0 || packet.pose.vy !== 0) return reject('A resting anchor must be stationary');
      this.poses.set(stream.member, copy(packet.pose));
      event = this.emit('settled', { member: stream.member, pose: packet.pose });
    } else if (packet.kind === 'switch') {
      const item = this.level.switches.find(item => item.id === packet.target);
      if (!item || !near(item)) return reject('Reach the bridge switch');
      if (this.progress.switches.includes(item.id)) return finish('accepted');
      this.progress.switches.push(item.id);
      this.progress.bridgeOpen = true;
      event = this.emit('contribution', { member: stream.member, collection: 'switches', target: item.id, bridgeOpen: true });
    } else if (packet.kind === 'key') {
      if (!near(this.level.key)) return reject('Reach the key');
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
    } else return reject('Unknown park action');
    return finish('accepted', [event, ...this.checkCompletion()]);
  }

  resume(key, since = null) {
    const stream = this.stream(key);
    const common = { epoch: this.epoch, clockMs: this.now(), streamId: stream.id, revision: this.revision, sequence: stream.sequence, receipts: copy(stream.receipts) };
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
