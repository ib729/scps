import { once } from "node:events";
import { existsSync, realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import WebSocket from "ws";
import {
  DEFAULT_LANE_ID,
  DEFAULT_SERVER_URL,
  NFC_DEBOUNCE_MS,
  NFC_POLL_INTERVAL_MS,
  NFC_TAP_SECRET,
  NFC_TIMEOUT_MS,
} from "./config";
import { readCardUid, resolveNfcDevice } from "./nfc-reader";

export interface BroadcasterOptions {
  url?: string;
  secret?: string;
  lane?: string;
  device?: string;
  simulate?: boolean;
  test?: boolean;
}

function socketUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error("Server URL must use HTTP(S) or WS(S)");
  url.pathname = `${url.pathname.replace(/\/$/, "").replace(/\/api\/nfc\/ws$/, "")}/api/nfc/ws`;
  url.hash = "";
  return url.href;
}

async function sendJson(socket: WebSocket, value: object): Promise<void> {
  if (socket.readyState !== WebSocket.OPEN) throw new Error("WebSocket is not open");
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const closed = () => reject(new Error("WebSocket closed while sending"));
  const failed = (error: Error) => reject(error);
  socket.once("close", closed);
  socket.once("error", failed);
  try {
    socket.send(JSON.stringify(value), (error) => error ? reject(error) : resolve());
  } catch (error) {
    reject(error);
  }
  try {
    await promise;
  } finally {
    socket.off("close", closed);
    socket.off("error", failed);
  }
}

export async function broadcastTap(socket: WebSocket, uid: string, lane: string, readerId = lane): Promise<void> {
  await sendJson(socket, {
    type: "tap",
    card_uid: uid.toUpperCase(),
    lane,
    reader_id: readerId,
    reader_ts: new Date().toISOString(),
  });
  console.log(`[OK] Tap broadcast: ${uid.toUpperCase()} (lane: ${lane}, reader_id: ${readerId})`);
}

async function authenticate(socket: WebSocket, secret: string, lane: string, signal: AbortSignal): Promise<void> {
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(NFC_TIMEOUT_MS)]);
  const response = once(socket, "message", { signal: timeout });
  const [, [raw]] = await Promise.all([
    sendJson(socket, { type: "auth", role: "broadcaster", secret, lane }),
    response,
  ]);
  const message: unknown = JSON.parse(String(raw));
  if (!message || typeof message !== "object" || !("type" in message) || message.type !== "auth_success") {
    throw new Error("Broadcaster authentication failed");
  }
  signal.throwIfAborted();
  console.log(`[WS] Authenticated (lane: ${lane})`);
}

function createSimulationInput() {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const stopped = new AbortController();
  const pending = new Set<Promise<void>>();
  let receive: ((uid: string) => Promise<void>) | undefined;
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    receive = undefined;
    void Promise.allSettled(pending).then(() => stopped.abort());
  };
  const line = (value: string) => {
    if (ended) return;
    const uid = value.trim();
    if (["q", "quit", "exit"].includes(uid.toLowerCase())) { finish(); return; }
    // Consume disconnected input immediately: it must never become a replay queue.
    if (uid && receive) {
      const sending = receive(uid.toUpperCase());
      pending.add(sending);
      void sending.then(() => pending.delete(sending), () => pending.delete(sending));
    }
  };
  input.on("line", line);
  input.on("close", finish);
  console.log("[SIMULATE] Enter a UID, or q/quit/exit to stop.");
  return {
    signal: stopped.signal,
    attach(receiver: ((uid: string) => Promise<void>) | undefined) { receive = receiver; },
    close() {
      receive = undefined;
      input.off("line", line);
      input.off("close", finish);
      input.close();
      process.stdin.pause();
    },
  };
}

async function readHardware(
  socket: WebSocket,
  device: string,
  lane: string,
  readerId: string,
  signal: AbortSignal,
  readUid: typeof readCardUid,
): Promise<void> {
  let retry = 1000;
  let lastUid: string | null = null;
  let lastTap = 0;
  while (!signal.aborted) {
    let uid: string | null;
    try {
      uid = await readUid(device, signal);
    } catch (error) {
      signal.throwIfAborted();
      console.error(`[NFC] Reader error; retrying ${device} in ${retry / 1000}s:`, error);
      await delay(retry, undefined, { signal });
      retry = Math.min(retry * 2, 30000);
      continue;
    }
    // Cancellation can arrive while an adapter is still releasing its descriptor.
    signal.throwIfAborted();
    retry = 1000;
    if (uid === null) lastUid = null;
    else {
      uid = uid.toUpperCase();
      const now = performance.now();
      if (uid !== lastUid || now - lastTap >= NFC_DEBOUNCE_MS) {
        await broadcastTap(socket, uid, lane, readerId);
        lastUid = uid;
        lastTap = now;
      }
    }
    await delay(NFC_POLL_INTERVAL_MS, undefined, { signal });
  }
  signal.throwIfAborted();
}

export async function runBroadcaster(
  options: BroadcasterOptions,
  signal: AbortSignal,
  readUid: typeof readCardUid = readCardUid,
): Promise<void> {
  if (signal.aborted) return;
  const url = socketUrl(options.url ?? DEFAULT_SERVER_URL);
  const lane = options.lane?.trim() || DEFAULT_LANE_ID.trim() || "default";
  const secret = options.secret ?? NFC_TAP_SECRET ?? "";
  const simulation = options.simulate && !options.test ? createSimulationInput() : undefined;
  const stopped = simulation ? AbortSignal.any([signal, simulation.signal]) : signal;
  let retry = 1000;
  try {
    const device = options.test || simulation ? undefined : await resolveNfcDevice(options.device, stopped);
    const usb = /(?:tty:|\/dev\/tty)USB([01])(?::|$)/.exec(device ?? options.device ?? process.env.PN532_DEVICE ?? "")?.[1];
    const readerId = options.test ? lane
      : usb === "0" || (simulation && lane.includes("1")) ? "reader-1"
      : usb === "1" || (simulation && lane.includes("2")) ? "reader-2" : lane;
    while (!stopped.aborted) {
      console.log(`[WS] Connecting to ${url}`);
      const socket = new WebSocket(url, { handshakeTimeout: NFC_TIMEOUT_MS });
      const generation = new AbortController();
      const connectionSignal = AbortSignal.any([stopped, generation.signal]);
      const { promise: closed, resolve: didClose } = Promise.withResolvers<void>();
      let heartbeat: NodeJS.Timeout | undefined;
      let pongTimeout: NodeJS.Timeout | undefined;
      const fail = (error: unknown) => {
        generation.abort(error);
        socket.terminate();
      };
      const onClose = () => {
        generation.abort(new Error("WebSocket closed"));
        didClose();
      };
      const onStop = () => fail(stopped.reason);
      const onPong = () => { clearTimeout(pongTimeout); pongTimeout = undefined; };
      socket.on("close", onClose);
      socket.on("error", fail);
      socket.on("pong", onPong);
      stopped.addEventListener("abort", onStop, { once: true });
      try {
        connectionSignal.throwIfAborted();
        await once(socket, "open", { signal: connectionSignal });
        await authenticate(socket, secret, lane, connectionSignal);
        retry = 1000;
        heartbeat = setInterval(() => {
          if (connectionSignal.aborted || socket.readyState !== WebSocket.OPEN) return;
          pongTimeout = setTimeout(() => fail(new Error("WebSocket heartbeat timed out")), 10000);
          socket.ping(undefined, undefined, (error: Error | undefined) => { if (error) fail(error); });
        }, 30000);
        if (options.test) {
          await broadcastTap(socket, "DEADBEEF", lane, readerId);
          return;
        }
        if (simulation) {
          simulation.attach(async (uid) => {
            if (connectionSignal.aborted) return;
            try { await broadcastTap(socket, uid, lane, readerId); }
            catch (error) { fail(error); throw error; }
          });
          connectionSignal.throwIfAborted();
          await once(connectionSignal, "abort");
          connectionSignal.throwIfAborted();
        } else {
          await readHardware(socket, device!, lane, readerId, connectionSignal, readUid);
        }
      } catch (error) {
        if (stopped.aborted) return;
        if (options.test) throw error;
        console.error("[WS] Connection lost:", error);
      } finally {
        simulation?.attach(undefined);
        generation.abort(new Error("Reader generation ended"));
        clearInterval(heartbeat);
        clearTimeout(pongTimeout);
        stopped.removeEventListener("abort", onStop);
        // readHardware has settled, including child close, before another owner starts.
        if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
        await closed;
        socket.off("close", onClose);
        socket.off("error", fail);
        socket.off("pong", onPong);
      }
      if (!stopped.aborted) {
        console.log(`[WS] Reconnecting in ${retry / 1000}s`);
        await delay(retry, undefined, { signal: stopped });
        retry = Math.min(retry * 2, 60000);
      }
    }
  } catch (error) {
    if (!stopped.aborted) throw error;
  } finally {
    simulation?.close();
  }
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const command = new Command()
    .name("tap-broadcaster")
    .description("Broadcast native NFC reader taps to the SCPS server")
    .option("--url <url>", "Server URL", DEFAULT_SERVER_URL)
    .option("--secret <secret>", "NFC broadcaster authentication secret")
    .option("--lane <lane>", "POS lane and reader identity", DEFAULT_LANE_ID)
    .option("--device <device>", "Explicit native or legacy NFC device selector")
    .option("--simulate", "Read UIDs from standard input without NFC hardware")
    .option("--test", "Send DEADBEEF once, then exit")
    .parse(args, { from: "user" });
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    await runBroadcaster(command.opts<BroadcasterOptions>(), shutdown.signal);
    return 0;
  } catch (error) {
    console.error("[ERROR]", error);
    return 1;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  void main().then((code) => { process.exitCode = code; }, (error: unknown) => { console.error("[ERROR]", error); process.exitCode = 1; });
}
