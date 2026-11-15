import type WebSocket from 'ws';

const key = Symbol.for('scps.nfc-readers');
const shared = globalThis as typeof globalThis & {
  [key]?: Map<string, Set<Pick<WebSocket, 'readyState'>>>;
};
const readers = shared[key] ??= new Map();

export function registerReader(lane: string, socket: Pick<WebSocket, 'readyState'>): () => void {
  let sockets = readers.get(lane);
  if (!sockets) readers.set(lane, sockets = new Set());
  sockets.add(socket);
  return () => {
    sockets.delete(socket);
    if (sockets.size === 0 && readers.get(lane) === sockets) readers.delete(lane);
  };
}

export function isReaderConnected(lane: string): boolean {
  const sockets = readers.get(lane);
  if (!sockets) return false;
  for (const socket of sockets) if (socket.readyState === 1) return true;
  return false;
}
