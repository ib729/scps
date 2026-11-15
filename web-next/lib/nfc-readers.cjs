const key = Symbol.for('scps.nfc-readers');
const readers = globalThis[key] ??= new Map();

function registerReader(lane, socket) {
  let sockets = readers.get(lane);
  if (!sockets) readers.set(lane, sockets = new Set());
  sockets.add(socket);
  return () => {
    sockets.delete(socket);
    if (sockets.size === 0 && readers.get(lane) === sockets) readers.delete(lane);
  };
}

function isReaderConnected(lane) {
  const sockets = readers.get(lane);
  if (!sockets) return false;
  for (const socket of sockets) if (socket.readyState === 1) return true;
  return false;
}

module.exports = { registerReader, isReaderConnected };
