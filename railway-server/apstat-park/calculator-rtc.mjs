import { randomUUID } from 'node:crypto';

// Signaling only. Peer data never enters the authoritative calculator state.
export function createCalculatorRtc({ bindings, registry, send, now }) {
  const sessions = new WeakMap();

  function optIn(ws, enabled, generation = 0) {
    const binding = bindings.get(ws);
    if (!enabled || !binding) { sessions.delete(ws); return; }
    const previous = sessions.get(ws);
    if (!Number.isSafeInteger(generation) || generation < 0) return;
    if (previous?.room === binding.room && previous.generation === generation) { previous.at = now(); return; }
    sessions.set(ws, { id: randomUUID(), room: binding.room, generation, at: now(), window: now(), count: 0 });
  }

  function selected(room) {
    const peers = [], names = new Set();
    for (const [ws, binding] of bindings) {
      const session = sessions.get(ws);
      if (binding.room !== room || session?.room !== room || now() - session.at > 5000) continue;
      const identity = registry._wsEntry(ws);
      if (!identity || identity.section !== binding.section || identity.username !== binding.name) continue;
      if (names.has(binding.name)) continue;
      names.add(binding.name);
      peers.push({ ws, binding, session });
      if (peers.length === 64) break;
    }
    return peers;
  }

  function peers(room) {
    const members = selected(room);
    const hub = members.find(member => member.binding.teacher) || members[0];
    return members.map(({ binding, session }) => ({ id: session.id, name: binding.name, hub: session.id === hub.session.id }));
  }

  function relay(ws, message) {
    const binding = bindings.get(ws);
    if (!binding || message.epoch !== binding.room.epoch) return;
    const members = selected(binding.room);
    const source = members.find(member => member.ws === ws);
    const target = members.find(member => member.session.id === message.to && member.ws !== ws);
    if (!source || !target || message.from !== source.session.id) return;
    const hub = members.find(member => member.binding.teacher) || members[0];
    if (source !== hub && target !== hub) return;
    const session = source.session;
    if (now() - session.window >= 1000) { session.window = now(); session.count = 0; }
    // A hub negotiates many connections at once; each pair still has a tight budget.
    session.rates ||= new Map();
    let rate = session.rates.get(target.session.id);
    if (!rate || now() - rate.window >= 1000) {
      if (session.rates.size >= 64) session.rates.delete(session.rates.keys().next().value);
      rate = { window: now(), count: 0 }; session.rates.set(target.session.id, rate);
    }
    if (++session.count > 512 || ++rate.count > 30 || (target.ws.bufferedAmount || 0) > 32768) return;
    const signal = message.signal;
    if (!signal || typeof signal !== 'object') return;
    let clean;
    if (['offer', 'answer'].includes(signal.type) && typeof signal.sdp === 'string' && signal.sdp.length <= 16384) {
      clean = { type: signal.type, sdp: signal.sdp };
    } else if (signal.type === 'candidate' && typeof signal.candidate === 'string' && signal.candidate.length <= 2048
      && (signal.sdpMid == null || (typeof signal.sdpMid === 'string' && signal.sdpMid.length <= 32))
      && (signal.sdpMLineIndex == null || (Number.isInteger(signal.sdpMLineIndex) && signal.sdpMLineIndex >= 0 && signal.sdpMLineIndex < 16))) {
      clean = { type: 'candidate', candidate: signal.candidate, sdpMid: signal.sdpMid ?? null,
        sdpMLineIndex: signal.sdpMLineIndex ?? null };
    } else return;
    send(target.ws, { type: 'calculator_rtc_signal', epoch: binding.room.epoch,
      from: session.id, to: target.session.id, signal: clean });
  }

  return { optIn, peers, relay, detached: ws => sessions.delete(ws) };
}
