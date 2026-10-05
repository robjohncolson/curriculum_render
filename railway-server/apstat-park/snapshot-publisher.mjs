// Preserve full snapshots for older clients and reconnect recovery. Only presence
// timestamps and the server clock are ignored when deciding whether state changed.
export function createSnapshotPublisher({ send, now, heartbeat = 1000 }) {
  const delivered = new WeakMap();
  return function publish(ws, packet, force = false) {
    if ((ws.bufferedAmount || 0) >= 32768) return false;
    const { clock, members, ...state } = packet;
    const fingerprint = JSON.stringify({ ...state, members: members?.map(({ at, ...member }) => member) });
    const previous = delivered.get(ws)?.get(packet.type), time = now();
    if (!force && previous?.fingerprint === fingerprint && time - previous.at < heartbeat) return false;
    send(ws, packet);
    if (!delivered.has(ws)) delivered.set(ws, new Map());
    delivered.get(ws).set(packet.type, { fingerprint, at: time });
    return true;
  };
}
