import { createParkLevel, PARK_LEVEL_COUNT } from './levels.mjs';

const HISTORY_LIMIT = 128;
const STREAMS_PER_MEMBER = 4;
const MOTION_INTERVAL_MS = 250;
const copy = value => structuredClone(value);
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

// The relay owns shared milestones, not a continuously simulated world.
// No tick loop, physics snapshots, engine memory or server audio state.
export class ParkSession {
  constructor({ epoch, members, now = () => performance.now() }) {
    requireValue(typeof epoch === 'string' && epoch.length > 0 && epoch.length <= 64, 'Invalid park epoch');
    requireValue(Array.isArray(members) && members.length >= 1 && members.length <= 8
      && new Set(members).size === members.length
      && members.every(name => typeof name === 'string' && name.length > 0 && name.length <= 80), 'Choose one to eight members');
    this.epoch = epoch;
    this.members = [...members];
    this.now = now;
    this.revision = 0;
    this.history = [];
    this.streams = new Map();
    this.nextStreamId = 1;
    this.poses = new Map();
    this.online = [];
    this.running = false;
    this.done = false;
    this.level = createParkLevel(0, this.members);
    this.progress = this.emptyProgress();
  }

  emptyProgress() { return { switches: [], samples: [], deliveries: [], arrived: [], bridgeOpen: false }; }

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

  setRunning(running) {
    requireValue(typeof running === 'boolean' && !this.done, 'Invalid park running state');
    if (this.running === running) return [];
    this.running = running;
    return [this.emit('running', { running })];
  }

  setOnline(members) {
    const online = this.members.filter(member => members.includes(member));
    if (JSON.stringify(online) === JSON.stringify(this.online)) return [];
    this.online = online;
    return [this.emit('presence', { online })];
  }

  // Called only by the authenticated teacher adapter; also permits skipping a
  // stuck level when a participant cannot return to the classroom connection.
  nextLevel() {
    if (this.done) return [];
    if (this.level.index + 1 === PARK_LEVEL_COUNT) {
      this.done = true;
      this.running = false;
      return [this.emit('finished', {})];
    }
    this.level = createParkLevel(this.level.index + 1, this.members);
    this.progress = this.emptyProgress();
    this.poses.clear();
    return [this.emit('level', { level: this.level, progress: this.progress })];
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
    if (!this.running || this.done) return reject('Your teacher has paused the park');
    if (!this.validPose(packet.pose)) return reject('Invalid position');
    const near = item => Math.hypot(packet.pose.x - item.x, packet.pose.y - item.y) <= 55;
    let event;
    if (packet.kind === 'switch' || packet.kind === 'sample') {
      const collection = packet.kind === 'switch' ? 'switches' : 'samples';
      const item = this.level[collection].find(item => item.id === packet.target);
      if (!item || item.owner !== stream.member || !near(item)) return reject('Reach your own marked station');
      if (this.progress[collection].includes(item.id)) return finish('accepted');
      if (packet.kind === 'switch' && this.level.samples.length
        && !this.progress.samples.includes(this.level.samples.find(sample => sample.owner === stream.member).id)) return reject('Collect your sample first');
      if (packet.kind === 'switch') {
        const incoming = this.level.samples.find(sample => sample.destination === item.id);
        if (incoming && !this.progress.deliveries.includes(incoming.id)) return reject(`Waiting for a parcel from ${incoming.owner}`);
      }
      this.progress[collection].push(item.id);
      this.progress.bridgeOpen = this.progress.switches.length === this.level.switches.length;
      event = this.emit('contribution', { member: stream.member, collection, target: item.id, bridgeOpen: this.progress.bridgeOpen });
    } else if (packet.kind === 'deliver') {
      const parcel = this.level.samples.find(sample => sample.id === packet.target && sample.destination);
      if (!parcel || parcel.owner !== stream.member || !this.progress.samples.includes(parcel.id)) return reject('Collect your own parcel first');
      const destination = this.level.switches.find(station => station.id === parcel.destination);
      if (!near(destination)) return reject(`Bring your parcel to ${destination.owner}'s station`);
      if (this.progress.deliveries.includes(parcel.id)) return finish('accepted');
      this.progress.deliveries.push(parcel.id);
      event = this.emit('contribution', { member: stream.member, collection: 'deliveries', target: parcel.id, bridgeOpen: this.progress.bridgeOpen });
    } else if (packet.kind === 'arrive') {
      if (!this.progress.bridgeOpen || !near(this.level.goal)) return reject('Help open the bridge, then reach the exit');
      if (this.progress.arrived.includes(stream.member)) return finish('accepted');
      this.progress.arrived.push(stream.member);
      event = this.emit('arrived', { member: stream.member, complete: this.progress.arrived.length === this.members.length });
    } else return reject('Unknown park action');
    return finish('accepted', [event]);
  }

  resume(key, since = null) {
    const stream = this.stream(key);
    const common = { epoch: this.epoch, streamId: stream.id, revision: this.revision, sequence: stream.sequence, receipts: copy(stream.receipts) };
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
