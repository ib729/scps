import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { test, type TestContext } from "node:test";
import { readCardUid, resolveNfcDevice, scanNfcDevices } from "./nfc-reader";

const opened = "NFC device: PN532 opened\n";
const target = "1 ISO14443A passive target(s) found:\n UID (NFCID1): de ad be ef\n";
const empty = "0 ISO14443A passive target(s) found.\n";
const scan = "2 NFC device(s) found:\n- Reader B:\n    pn53x_usb:002:004\n- Reader A:\n    pn532_uart:/dev/ttyUSB1:115200\n";

interface ChildEvent {
  type: string;
  pid: number;
  device?: string;
  defaultDevice?: string;
  locale: string;
  autoscan?: string;
  args: string[];
}

function fixture(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps native reader "));
  const config = path.join(directory, "config.json");
  const log = path.join(directory, "events.log");
  fs.writeFileSync(log, "");
  fs.writeFileSync(config, "{}");
  // Real OS child signals and descriptor-close ordering cannot use JavaScript fake time.
  const executable = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const config = JSON.parse(fs.readFileSync(process.env.NFC_FIXTURE, 'utf8'));
const scanner = path.basename(process.argv[1]) === 'nfc-scan-device';
const event = type => fs.appendFileSync(process.env.NFC_EVENTS, JSON.stringify({
  type, pid: process.pid, device: process.env.LIBNFC_DEVICE,
  defaultDevice: process.env.LIBNFC_DEFAULT_DEVICE, locale: process.env.LC_ALL,
  autoscan: process.env.LIBNFC_AUTO_SCAN, args: process.argv.slice(2)
}) + '\\n');
if (scanner && !config.block) {
  event('open');
  process.stdout.write(config.scan || 'No NFC device found.\\n');
  process.stderr.write(config.error || '');
  process.exit(config.code ?? (config.scan ? 0 : 1));
}
const lock = process.env.NFC_EVENTS + '.lock';
const fd = fs.openSync(lock, 'wx');
const close = () => { fs.closeSync(fd); fs.unlinkSync(lock); event('close'); };
if (config.block) {
  process.on('SIGTERM', () => {
    event('term');
    if (config.ignoreTerm) return;
    setTimeout(() => {
      close();
      process.stdout.write('NFC device: PN532 opened\\n1 ISO14443A passive target(s) found:\\n UID (NFCID1): DE AD BE EF\\n');
      process.exit(0);
    }, 100);
  });
  event('open');
  setInterval(() => {}, 1000);
} else {
  event('open');
  process.stdout.write(config.output || '');
  process.stderr.write(config.error || '');
  close();
  process.exit(config.code || 0);
}
`;
  for (const name of ["nfc-list", "nfc-scan-device"]) {
    fs.writeFileSync(path.join(directory, name), executable, { mode: 0o700 });
  }
  const keys = ["PATH", "NFC_FIXTURE", "NFC_EVENTS", "PN532_DEVICE", "LIBNFC_DEVICE", "LIBNFC_DEFAULT_DEVICE"];
  const previous = keys.map((key) => [key, process.env[key]] as const);
  process.env.PATH = `${directory}:${process.env.PATH ?? ""}`;
  process.env.NFC_FIXTURE = config;
  process.env.NFC_EVENTS = log;
  delete process.env.PN532_DEVICE;
  delete process.env.LIBNFC_DEVICE;
  delete process.env.LIBNFC_DEFAULT_DEVICE;
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    log,
    set(value: object) { fs.writeFileSync(config, JSON.stringify(value)); },
    events(): ChildEvent[] {
      return fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as ChildEvent);
    },
  };
}

test("native UID forms are uppercase while healthy opened readers without a card return null", async (t) => {
  const f = fixture(t);
  for (const [kind, label, uid] of [
    ["ISO14443A", "UID (NFCID1)", "04 A1 B2 C3"],
    ["ISO14443A", "UID (NFCID3)", "08 A1 B2 C3"],
    ["Felica (212 kbps)", "ID (NFCID2)", "01 23 45 67 89 AB CD EF"],
    ["Felica (424 kbps)", "IDm", "01 02 03 04 05 06 07 08"],
    ["ISO14443B", "PUPI", "12 34 56 78"],
    ["ISO14443B'", "DIV", "12 34 56 AB"],
    ["ISO14443B-2 ST SRx", "UID", "01 02 03 04 05 06 07 08"],
    ["ISO14443B-2 ASK CTx", "UID", "AA BB CC DD"],
    ["ISO14443A-3 Jewel", "4-LSB JEWELID", "01 23 45 67"],
  ]) {
    f.set({ output: opened + `1 ${kind} passive target(s) found:\n ${label}: ${uid.toLowerCase()}\n Parameter (PAD): ff ff ff ff ff ff ff ff\n` });
    assert.equal(await readCardUid("tty:USB0:pn532", new AbortController().signal), uid.replaceAll(" ", ""));
  }
  f.set({ output: opened + empty });
  assert.equal(await readCardUid("pn532_i2c:/dev/i2c-1", new AbortController().signal), null);
});

test("one FeliCa card reported at both native bitrates is one identifier, not two targets", async (t) => {
  const f = fixture(t);
  f.set({ output: opened + "1 Felica (212 kbps) passive target(s) found:\n ID (NFCID2): 01 23 45 67 89 ab cd ef\n1 Felica (424 kbps) passive target(s) found:\n ID (NFCID2): 01 23 45 67 89 ab cd ef\n" });
  assert.equal(await readCardUid("tty:USB0:pn532", new AbortController().signal), "0123456789ABCDEF");
  f.set({ output: opened + "1 Felica (212 kbps) passive target(s) found:\n ID (NFCID2): 01 23 45 67 89 ab cd ef\n1 Felica (424 kbps) passive target(s) found:\n ID (NFCID2): 11 23 45 67 89 ab cd ef\n" });
  await assert.rejects(readCardUid("tty:USB0:pn532", new AbortController().signal), /multiple|ambiguous/i);
});

test("native reads select exactly one reader without shell interpolation or implicit autoscan", async (t) => {
  const f = fixture(t);
  process.env.LIBNFC_DEVICE = "pn53x_usb:999:999";
  process.env.LIBNFC_DEFAULT_DEVICE = "pn53x_usb:888:888";
  f.set({ output: opened + target });
  const device = "pn532_uart:/dev/serial/by-id/a reader;not-a-shell:115200";
  assert.equal(await readCardUid(device, new AbortController().signal), "DEADBEEF");
  const [event] = f.events();
  assert.equal(event.device, device);
  assert.equal(event.defaultDevice, undefined);
  assert.equal(event.locale, "C");
  assert.equal(event.autoscan, "no");
  assert.deepEqual(event.args, ["-v"]);
});

test("missing, failed, malformed and ambiguous targets never become a healthy empty poll", async (t) => {
  const f = fixture(t);
  for (const output of [
    "No NFC device found.\n", "Unable to open NFC device\n", opened,
    opened + "2 ISO14443A passive target(s) found:\n UID: aa bb cc dd\n",
    opened + target + target,
    opened + target + "1 ISO14443B passive target(s) found:\n PUPI: de ad be ef\n",
    opened + target + "UID: de ad be ef\n",
    opened + target.replace("de ad be ef", "de ad b"),
    opened + target.replace("de ad be ef", "de ad XX ef"),
    opened + target.replace("UID (NFCID1)", "unsupported identifier"),
    opened + empty + "UID: de ad be ef\n",
    opened + empty + opened + empty,
    opened + empty + "error libnfc.driver: device disconnected\n",
  ]) {
    f.set({ output });
    await assert.rejects(readCardUid("tty:USB0:pn532", new AbortController().signal));
  }
  for (const value of [
    { output: opened + empty, code: 1 },
    { output: opened + target, error: "error libnfc: Input/output error", code: 0 },
  ]) {
    f.set(value);
    await assert.rejects(readCardUid("tty:USB0:pn532", new AbortController().signal));
  }
});

test("explicit CLI and environment devices normalize UART/I2C and preserve native strings without probing", async (t) => {
  const f = fixture(t);
  const signal = new AbortController().signal;
  process.env.PN532_DEVICE = "tty:USB9:pn532";
  assert.equal(await resolveNfcDevice("tty:USB0:pn532", signal), "pn532_uart:/dev/ttyUSB0");
  assert.equal(await resolveNfcDevice(undefined, signal), "pn532_uart:/dev/ttyUSB9");
  for (const [input, expected] of [
    ["tty:AMA0:pn532", "pn532_uart:/dev/ttyAMA0"],
    ["tty:ttyACM1:pn532", "pn532_uart:/dev/ttyACM1"],
    ["tty:/dev/serial/by-id/my-reader:pn532", "pn532_uart:/dev/serial/by-id/my-reader"],
    ["/dev/ttyUSB2", "pn532_uart:/dev/ttyUSB2"],
    ["i2c:/dev/i2c-1:pn532", "pn532_i2c:/dev/i2c-1"],
    ["i2c:2:pn532", "pn532_i2c:/dev/i2c-2"],
    ["pn532_i2c:/dev/i2c-3", "pn532_i2c:/dev/i2c-3"],
    ["pn53x_usb:001:003", "pn53x_usb:001:003"],
    ["pn532_uart:/dev/serial/by-id/a reader:115200", "pn532_uart:/dev/serial/by-id/a reader:115200"],
  ]) assert.equal(await resolveNfcDevice(input, signal), expected);
  for (const input of ["", "unknown:reader", "usb:04e6:5591", "tty:USB0:unknown", "i2c:wrong:pn532", `pn532_uart:${"x".repeat(1024)}`]) {
    await assert.rejects(resolveNfcDevice(input, signal));
  }
  process.env.PN532_DEVICE = "unknown:reader";
  await assert.rejects(resolveNfcDevice(undefined, signal));
  assert.deepEqual(f.events(), []);
});

test("discovery returns exact sorted connstrings and only no devices permits the legacy default", async (t) => {
  const f = fixture(t);
  const signal = new AbortController().signal;
  process.env.LIBNFC_DEVICE = "pn53x_usb:999:999";
  process.env.LIBNFC_DEFAULT_DEVICE = "pn53x_usb:888:888";
  f.set({ scan });
  assert.deepEqual(await scanNfcDevices(signal), ["pn532_uart:/dev/ttyUSB1:115200", "pn53x_usb:002:004"]);
  assert.equal(await resolveNfcDevice(undefined, signal), "pn532_uart:/dev/ttyUSB1:115200");
  const [event] = f.events();
  assert.deepEqual(event.args, ["-i"]);
  assert.equal(event.device, undefined);
  assert.equal(event.defaultDevice, undefined);
  assert.equal(event.locale, "C");
  f.set({});
  assert.deepEqual(await scanNfcDevices(signal), []);
  assert.equal(await resolveNfcDevice(undefined, signal), "pn532_uart:/dev/ttyAMA0");
  for (const value of [
    { scan: "nfc_open failed for pn53x_usb:002:004\n" },
    { scan: "- Unsupported:\n    unknown:reader\n" },
    { scan, code: 2 },
  ]) {
    f.set(value);
    await assert.rejects(resolveNfcDevice(undefined, signal));
  }
});

test("legacy USB selectors resolve exactly, never a missing or ambiguous device", async (t) => {
  const f = fixture(t);
  const signal = new AbortController().signal;
  f.set({ scan });
  assert.equal(await resolveNfcDevice("usb:2:4", signal), "pn53x_usb:002:004");
  await assert.rejects(resolveNfcDevice("usb:002:099", signal), /missing|match|found/i);
  f.set({ scan: "- A:\n pn53x_usb:002:004\n- B:\n acr122_usb:002:004\n" });
  await assert.rejects(resolveNfcDevice("usb:002:004", signal), /ambiguous/i);
});

test("abort drops a stale UID only after child close and refuses a second reader owner meanwhile", async (t) => {
  const f = fixture(t);
  f.set({ block: true });
  const watcher = fs.watch(f.log);
  t.after(() => watcher.close());
  const ready = once(watcher, "change", { signal: AbortSignal.timeout(2000) });
  const controller = new AbortController();
  const rejected = assert.rejects(readCardUid("tty:USB0:pn532", controller.signal), { name: "AbortError" });
  await ready;
  watcher.close();
  const pid = f.events()[0].pid;
  controller.abort();
  await assert.rejects(readCardUid("tty:USB0:pn532", new AbortController().signal), /owned|busy/i);
  await rejected;
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  f.set({ output: opened + target.replace("de ad be ef", "11 22 33 44") });
  assert.equal(await readCardUid("tty:USB0:pn532", new AbortController().signal), "11223344");
  assert.deepEqual(f.events().map((event) => event.type), ["open", "term", "close", "open", "close"]);
});

test("a native child ignoring SIGTERM times out and is dead before the read rejects", { timeout: 8000 }, async (t) => {
  // Real OS termination/descriptor release cannot be exercised with a mocked parent clock.
  const f = fixture(t);
  f.set({ block: true, ignoreTerm: true });
  const started = Date.now();
  await assert.rejects(readCardUid("pn532_i2c:/dev/i2c-1", new AbortController().signal), /timeout|timed out/i);
  assert.ok(Date.now() - started < 7000);
  const [event] = f.events();
  assert.throws(() => process.kill(event.pid, 0), { code: "ESRCH" });
  assert.ok(f.events().some((entry) => entry.type === "term"));
});

test("cancelled calls never spawn and missing native executables are hardware errors", async (t) => {
  const f = fixture(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readCardUid("pn532_i2c:/dev/i2c-1", controller.signal), { name: "AbortError" });
  assert.deepEqual(f.events(), []);
  process.env.PATH = f.directory + "/missing";
  await assert.rejects(readCardUid("pn532_i2c:/dev/i2c-1", new AbortController().signal), /ENOENT|not found/);
});

test("device scans use the same cancellable child shutdown barrier", async (t) => {
  const f = fixture(t);
  f.set({ block: true, ignoreTerm: true });
  const watcher = fs.watch(f.log);
  t.after(() => watcher.close());
  const ready = once(watcher, "change", { signal: AbortSignal.timeout(2000) });
  const controller = new AbortController();
  const rejected = assert.rejects(scanNfcDevices(controller.signal), { name: "AbortError" });
  await ready;
  watcher.close();
  const pid = f.events()[0].pid;
  controller.abort();
  await rejected;
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});
