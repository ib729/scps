import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { watch } from "node:fs";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import { broadcastTap, runBroadcaster } from "./tap-broadcaster";

const fixtureSecret = "scps-test-fixture-broadcaster-only";
const fixtureDevice = "pn532_i2c:/dev/i2c-1";
const entrypoint = fileURLToPath(new URL("./tap-broadcaster.ts", import.meta.url));
const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
type Frame = Record<string, unknown>;

class Queue<T> {
  readonly values: T[] = [];
  private readonly waiting: ((value: T) => void)[] = [];

  push(value: T) {
    const next = this.waiting.shift();
    if (next) next(value);
    else this.values.push(value);
  }

  take(): Promise<T> {
    if (this.values.length) return Promise.resolve(this.values.shift()!);
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    const deadline = AbortSignal.timeout(7000);
    const deliver = (value: T) => {
      deadline.removeEventListener("abort", timedOut);
      resolve(value);
    };
    const timedOut = () => {
      this.waiting.splice(this.waiting.indexOf(deliver), 1);
      reject(new Error("Timed out waiting for broadcaster event"));
    };
    deadline.addEventListener("abort", timedOut, { once: true });
    this.waiting.push(deliver);
    return promise;
  }
}

async function localServer(automaticAuth = true) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const authenticated = new Queue<{ socket: WebSocket; frame: Frame }>();
  const taps = new Queue<Frame>();
  const received: Frame[] = [];
  server.on("connection", (socket, request) => {
    assert.equal(request.url, "/api/nfc/ws");
    socket.on("error", () => {});
    socket.on("message", (raw) => {
      const frame = JSON.parse(String(raw)) as Frame;
      received.push(frame);
      if (frame.type === "auth") {
        if (automaticAuth) socket.send(JSON.stringify({ type: "auth_success" }));
        authenticated.push({ socket, frame });
      } else if (frame.type === "tap") taps.push(frame);
    });
  });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    url: `http://127.0.0.1:${address.port}`,
    authenticated,
    taps,
    received,
    async close() {
      const closed = once(server, "close");
      for (const socket of server.clients) socket.terminate();
      server.close();
      await closed;
    },
  };
}

function launch(url: string, args: string[], executable = entrypoint) {
  const child = spawn(process.execPath, ["--import", loader, executable, "--url", url, "--secret", fixtureSecret, "--lane", "fixture-lane", ...args], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NFC_TAP_SECRET: fixtureSecret },
  });
  let output = "";
  const { promise: ready, resolve: authenticated } = Promise.withResolvers<void>();
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    if (output.includes("[WS] Authenticated")) authenticated();
  });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  const exited = once(child, "exit", { signal: AbortSignal.timeout(7000) });
  return { child, exited, ready, output: () => output };
}

test("closed socket sends reject instead of hiding the reconnect trigger", { timeout: 10000 }, async () => {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  server.on("connection", (socket) => socket.close());
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  try {
    await once(socket, "close");
    await assert.rejects(broadcastTap(socket, "OLD", "fixture-lane"), /closed|open|connected/i);
  } finally {
    socket.terminate();
    server.close();
    await once(server, "close");
  }
});

test("authentication completes before reads and preserves the tap wire contract", { timeout: 10000 }, async () => {
  const server = await localServer(false);
  const stop = new AbortController();
  let reads = 0;
  const task = runBroadcaster({ url: server.url, secret: fixtureSecret, lane: "fixture-lane", device: fixtureDevice }, stop.signal, async () => ++reads === 1 ? "aabb" : null);
  try {
    const { socket, frame } = await server.authenticated.take();
    assert.deepEqual(frame, { type: "auth", role: "broadcaster", secret: fixtureSecret, lane: "fixture-lane" });
    assert.equal(reads, 0);
    socket.send(JSON.stringify({ type: "auth_success" }));
    const tap = await server.taps.take();
    assert.equal(tap.type, "tap");
    assert.equal(tap.card_uid, "AABB");
    assert.equal(tap.lane, "fixture-lane");
    assert.equal(tap.reader_id, "fixture-lane");
    assert.match(String(tap.reader_ts), /^\d{4}-\d{2}-\d{2}T.*Z$/);
    assert.ok(Math.abs(Date.now() - Date.parse(String(tap.reader_ts))) < 5000);
  } finally {
    stop.abort();
    await task;
    await server.close();
  }
});

test("hardware reader identity follows the selected USB reader, independently of its lane", { timeout: 10000 }, async () => {
  const server = await localServer();
  const stop = new AbortController();
  const task = runBroadcaster({ url: server.url, secret: fixtureSecret, lane: "checkout", device: "tty:USB1:pn532" }, stop.signal, async () => "AABB");
  try {
    const tap = await server.taps.take();
    assert.equal(tap.lane, "checkout");
    assert.equal(tap.reader_id, "reader-2");
  } finally {
    stop.abort();
    await task;
    await server.close();
  }
});

test("idle disconnect waits for the old generation release and delivers only FRESH", { timeout: 12000 }, async () => {
  const server = await localServer();
  const stop = new AbortController();
  const started = Promise.withResolvers<void>();
  const aborted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<string>();
  let reads = 0;
  let owners = 0;
  let maximumOwners = 0;
  const task = runBroadcaster({ url: server.url, secret: fixtureSecret, lane: "reader-1", device: fixtureDevice }, stop.signal, async (_device, signal) => {
    owners++;
    maximumOwners = Math.max(maximumOwners, owners);
    try {
      if (++reads === 1) {
        signal.addEventListener("abort", () => aborted.resolve(), { once: true });
        started.resolve();
        return await release.promise;
      }
      return reads === 2 ? "FRESH" : null;
    } finally {
      owners--;
    }
  });
  try {
    const first = await server.authenticated.take();
    await started.promise;
    first.socket.close();
    await aborted.promise;
    assert.equal(reads, 1);
    assert.equal(server.authenticated.values.length, 0);
    release.resolve("OLD");
    await server.authenticated.take();
    assert.equal((await server.taps.take()).card_uid, "FRESH");
    assert.equal(maximumOwners, 1);
    assert.deepEqual(server.received.filter((frame) => frame.type === "tap").map((frame) => frame.card_uid), ["FRESH"]);
  } finally {
    release.resolve("OLD");
    stop.abort();
    await task;
    await server.close();
  }
});

test("I2C hardware failure retries the exact backend without reconnecting the socket", { timeout: 10000 }, async () => {
  const server = await localServer();
  const stop = new AbortController();
  const devices: string[] = [];
  const task = runBroadcaster({ url: server.url, secret: fixtureSecret, lane: "reader-1", device: fixtureDevice }, stop.signal, async (device) => {
    devices.push(device);
    if (devices.length === 1) throw new Error("fixture reader disconnected");
    return devices.length === 2 ? "RECOVERED" : null;
  });
  try {
    assert.equal((await server.taps.take()).card_uid, "RECOVERED");
    assert.deepEqual(devices.slice(0, 2), [fixtureDevice, fixtureDevice]);
    assert.equal(server.received.filter((frame) => frame.type === "auth").length, 1);
  } finally {
    stop.abort();
    await task;
    await server.close();
  }
});

test("read spacing, UID debounce and removal tracking survive the TypeScript cutover", { timeout: 10000 }, async () => {
  // This integration checks real loop spacing/debounce; fake clocks would also stall ws I/O.
  const server = await localServer();
  const stop = new AbortController();
  const readTimes: number[] = [];
  let remove = false;
  const task = runBroadcaster({ url: server.url, secret: fixtureSecret, lane: "reader-1", device: fixtureDevice }, stop.signal, async () => {
    readTimes.push(performance.now());
    if (remove) { remove = false; return null; }
    return "aabb";
  });
  try {
    const first = await server.taps.take();
    const second = await server.taps.take();
    assert.ok(Date.parse(String(second.reader_ts)) - Date.parse(String(first.reader_ts)) >= 1500);
    remove = true;
    const third = await server.taps.take();
    assert.equal(third.card_uid, "AABB");
    assert.ok(Date.parse(String(third.reader_ts)) - Date.parse(String(second.reader_ts)) < 1000);
    for (let i = 1; i < readTimes.length; i++) assert.ok(readTimes[i] - readTimes[i - 1] >= 95);
  } finally {
    stop.abort();
    await task;
    await server.close();
  }
});

test("simulation has one input owner, uppercases UIDs and exits on EOF or every quit spelling", { timeout: 30000 }, async () => {
  for (const ending of ["", "q\n", "quit\n", "exit\n"]) {
    const server = await localServer();
    const process = launch(server.url, ["--simulate"]);
    try {
      await server.authenticated.take();
      await process.ready;
      process.child.stdin.write("aabb\n");
      assert.equal((await server.taps.take()).card_uid, "AABB");
      if (ending) process.child.stdin.write(ending);
      else process.child.stdin.end();
      assert.equal((await process.exited)[0], 0, process.output());
      assert.equal(server.received.filter((frame) => frame.type === "auth").length, 1);
    } finally {
      if (process.child.exitCode === null) process.child.kill("SIGKILL");
      await server.close();
    }
  }
});

test("SIGTERM stops simulation and clears socket heartbeat resources within the service window", { timeout: 10000 }, async () => {
  const server = await localServer();
  const process = launch(server.url, ["--simulate"]);
  try {
    await server.authenticated.take();
    await process.ready;
    process.child.kill("SIGTERM");
    assert.equal((await process.exited)[0], 0, process.output());
  } finally {
    if (process.child.exitCode === null) process.child.kill("SIGKILL");
    await server.close();
  }
});

test("single test tap works through a symlinked entrypoint and denied authentication exits one", { timeout: 20000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "scps broadcaster entry "));
  const alias = path.join(directory, "reader alias.ts");
  await symlink(entrypoint, alias);
  try {
    for (const approved of [true, false]) {
      const server = await localServer(false);
      const process = launch(server.url, ["--test"], alias);
      try {
        const { socket } = await server.authenticated.take();
        socket.send(JSON.stringify({ type: approved ? "auth_success" : "auth_failed", message: "fixture denied" }));
        if (approved) assert.equal((await server.taps.take()).card_uid, "DEADBEEF");
        assert.equal((await process.exited)[0], approved ? 0 : 1, process.output());
        if (!approved) assert.equal(server.received.filter((frame) => frame.type === "tap").length, 0);
      } finally {
        if (process.child.exitCode === null) process.child.kill("SIGKILL");
        await server.close();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a real libnfc child releases its descriptor before reconnect opens the next owner", { timeout: 15000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "scps cancellable nfc "));
  const executable = path.join(directory, "nfc-list");
  const log = path.join(directory, "events.jsonl");
  const lock = path.join(directory, "reader.lock");
  const state = path.join(directory, "reads");
  const originalPath = process.env.PATH;
  const server = await localServer();
  const stop = new AbortController();
  // Delayed real child termination exercises OS descriptor release, not mocked timers.
  await writeFile(executable, `#!${process.execPath}
const fs = require('node:fs');
const log = ${JSON.stringify(log)}, lock = ${JSON.stringify(lock)}, state = ${JSON.stringify(state)};
const event = value => fs.appendFileSync(log, JSON.stringify(value) + '\\n');
const count = fs.existsSync(state) ? Number(fs.readFileSync(state, 'utf8')) + 1 : 1;
fs.writeFileSync(state, String(count));
const fd = fs.openSync(lock, 'wx');
const release = () => { fs.closeSync(fd); fs.unlinkSync(lock); event({type:'release',count}); };
const output = uid => process.stdout.write('NFC device: fixture reader opened\\n1 ISO14443A passive target(s) found:\\n    UID (NFCID1): ' + uid + '\\n');
if (count === 1) {
  output('0b ad 12 34');
  const timer = setInterval(() => {}, 1000);
  process.on('SIGTERM', () => {
    event({type:'term',count});
    setTimeout(() => { release(); clearInterval(timer); process.exit(0); }, 150);
  });
  event({type:'start', count, pid:process.pid});
} else {
  event({type:'start', count, pid:process.pid});
  output('fa ce 12 34');
  release();
}
`, { mode: 0o700 });
  await writeFile(log, "");
  const { promise: childStarted, resolve: opened, reject: observationFailed } = Promise.withResolvers<void>();
  const observations = watch(log, () => {
    void readFile(log, "utf8").then((text) => {
      if (text.includes('"start"')) opened();
    }, observationFailed);
  });
  observations.on("error", observationFailed);
  process.env.PATH = `${directory}${path.delimiter}${originalPath ?? ""}`;
  const task = runBroadcaster({ url: server.url, secret: fixtureSecret, lane: "reader-1", device: fixtureDevice }, stop.signal);
  try {
    const { socket } = await server.authenticated.take();
    await childStarted;
    socket.close();
    assert.equal((await server.taps.take()).card_uid, "FACE1234");
    stop.abort();
    await task;
    const events = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { type: string; count: number });
    const firstReleased = events.findIndex((event) => event.type === "release" && event.count === 1);
    const secondOpened = events.findIndex((event) => event.type === "start" && event.count === 2);
    assert.ok(events.some((event) => event.type === "term" && event.count === 1));
    assert.ok(firstReleased >= 0 && secondOpened > firstReleased);
    assert.deepEqual(server.received.filter((frame) => frame.type === "tap").map((frame) => frame.card_uid), ["FACE1234"]);
  } finally {
    stop.abort();
    await task;
    observations.close();
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
