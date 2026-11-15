import { spawn } from "node:child_process";
import { DEFAULT_NFC_DEVICE, NFC_TIMEOUT_MS } from "./config";

const terminationGraceMs = 250;
const nativeDrivers: Record<string, true> = {
  pn532_uart: true, pn532_i2c: true, pn53x_usb: true, acr122_usb: true,
  acr122_pcsc: true, pcsc: true, acr122s: true, arygon: true,
  pn532_spi: true, pn71xx: true,
};
const hardwareFailure = /\b(?:error|failed|unable|invalid|unavailable|disconnected|timed out|timeout|permission denied|no such (?:file|device)|not found)\b/i;
const activeReaders = new Set<string>();

interface NativeResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
}

function isNativeConnstring(device: string): boolean {
  const separator = device.indexOf(":");
  return separator > 0 && separator < device.length - 1 && Buffer.byteLength(device) < 1024
    && Object.hasOwn(nativeDrivers, device.slice(0, separator)) && !/[\0\r\n]/.test(device);
}

function runNative(command: string, args: string[], signal: AbortSignal, device?: string): Promise<NativeResult> {
  signal.throwIfAborted();
  const env: NodeJS.ProcessEnv = { ...process.env, LC_ALL: "C" };
  delete env.LIBNFC_DEVICE;
  delete env.LIBNFC_DEFAULT_DEVICE;
  if (device !== undefined) {
    env.LIBNFC_DEVICE = device;
    // Disable discovery so an explicit reader cannot fall back to another device.
    env.LIBNFC_AUTO_SCAN = "no";
  } else {
    env.LIBNFC_AUTO_SCAN = "yes";
  }
  const { promise, resolve, reject } = Promise.withResolvers<NativeResult>();
  const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let failure: unknown;
  let failed = false;
  let killTimer: NodeJS.Timeout | undefined;
  const terminate = (reason: unknown) => {
    if (failed) return;
    failed = true;
    failure = reason;
    child.kill("SIGTERM");
    killTimer = setTimeout(() => child.kill("SIGKILL"), terminationGraceMs);
  };
  const abort = () => terminate(signal.reason);
  const timeout = setTimeout(() => terminate(new Error(`${command} timed out after ${NFC_TIMEOUT_MS}ms`)), NFC_TIMEOUT_MS);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    if (failed) return;
    stdout += chunk;
    if (stdout.length + stderr.length > 1024 * 1024) terminate(new Error(`${command} produced too much output`));
  });
  child.stderr.on("data", (chunk: string) => {
    if (failed) return;
    stderr += chunk;
    if (stdout.length + stderr.length > 1024 * 1024) terminate(new Error(`${command} produced too much output`));
  });
  child.on("error", (error) => {
    if (!failed) {
      failed = true;
      failure = error;
    }
  });
  // Only close proves the process and its reader descriptors have been released.
  child.on("close", (code, exitSignal) => {
    clearTimeout(timeout);
    clearTimeout(killTimer);
    signal.removeEventListener("abort", abort);
    if (signal.aborted) reject(signal.reason);
    else if (failed) reject(failure);
    else resolve({ stdout, stderr, code, signal: exitSignal });
  });
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  return promise;
}

function requireSuccess(command: string, result: NativeResult): void {
  if (result.code !== 0 || result.signal !== null || hardwareFailure.test(result.stderr)) {
    throw new Error(`${command} failed (${result.signal ?? result.code}): ${(result.stderr || result.stdout).trim()}`);
  }
}

/** Read one exact libnfc reader; null is an opened, healthy reader with no card. */
export async function readCardUid(device: string, signal: AbortSignal): Promise<string | null> {
  signal.throwIfAborted();
  if (!isNativeConnstring(device)) device = await resolveNfcDevice(device, signal);
  if (!isNativeConnstring(device)) throw new Error("An exact native NFC device connstring is required");
  if (activeReaders.has(device)) throw new Error(`NFC reader is already owned by an active read: ${device}`);
  activeReaders.add(device);
  let result: NativeResult;
  try {
    result = await runNative("nfc-list", ["-v"], signal, device);
  } finally {
    activeReaders.delete(device);
  }
  signal.throwIfAborted();
  requireSuccess("nfc-list", result);
  if (/No NFC device found\b/i.test(result.stdout) || hardwareFailure.test(result.stdout)) {
    throw new Error(`NFC reader unavailable: ${result.stdout.trim()}`);
  }
  const opened = result.stdout.match(/^NFC device: .+ opened\s*$/gm) ?? [];
  if (opened.length !== 1) throw new Error("Expected exactly one opened NFC reader");
  const counts = [...result.stdout.matchAll(/^(\d+) .+ passive target\(s\) found[.:]\s*$/gm)];
  if (counts.length === 0) throw new Error("NFC reader did not report a completed target scan");
  const targetCount = counts.reduce((sum, match) => sum + Number(match[1]), 0);
  const identifiers = [...result.stdout.matchAll(/^\s*(?:UID(?:\s+\(NFCID[13]\))?|ID\s+\(NFCID2\)|IDm(?:\s+\(NFCID2\))?|NFCID[123]|PUPI|DIV|4-LSB JEWELID)\s*:\s*([^\r\n]*)$/gim)];
  if (targetCount === 0 && identifiers.length === 0) return null;
  // nfc-list scans the same FeliCa card at both supported bitrates.
  const repeatedFelica = targetCount === 2 && identifiers.length === 2
    && counts.some(count => /^1 Felica \(212 kbps\)/.test(count[0]))
    && counts.some(count => /^1 Felica \(424 kbps\)/.test(count[0]));
  if ((targetCount !== 1 || identifiers.length !== 1) && !repeatedFelica) throw new Error("Missing or ambiguous multiple NFC target identifiers");
  let uid = "";
  for (const identifier of identifiers) {
    const value = identifier[1].trim();
    if (!/^(?:[a-f\d]{2}\s*){2,10}$/i.test(value)) throw new Error("Invalid NFC target identifier");
    const normalized = value.replace(/\s/g, "").toUpperCase();
    if (uid && uid !== normalized) throw new Error("Multiple NFC targets are ambiguous; present only one card");
    uid = normalized;
  }
  return uid;
}

/** Enumerate exact opened native connstrings, never nfcpy USB selectors. */
export async function scanNfcDevices(signal: AbortSignal): Promise<string[]> {
  const result = await runNative("nfc-scan-device", ["-i"], signal);
  signal.throwIfAborted();
  if (/^No NFC device found\.\s*$/m.test(result.stdout) && !result.stderr.trim() && (result.code === 0 || result.code === 1) && !result.signal) return [];
  requireSuccess("nfc-scan-device", result);
  if (hardwareFailure.test(result.stdout)) throw new Error(`NFC scan failed: ${result.stdout.trim()}`);
  const devices: string[] = [];
  const lines = result.stdout.split(/\r?\n/);
  for (let index = 1; index < lines.length; index++) {
    if (!/^- .+:\s*$/.test(lines[index - 1])) continue;
    const connstring = lines[index].trim();
    if (!isNativeConnstring(connstring)) {
      throw new Error(`Unsupported native NFC connstring: ${connstring}`);
    }
    devices.push(connstring);
  }
  if (devices.length === 0) throw new Error("NFC scan reported no usable reader connstrings");
  return [...new Set(devices)].sort();
}

/** Explicit CLI selection wins over environment, sorted native discovery, then legacy UART. */
export async function resolveNfcDevice(cliDevice: string | undefined, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  let device = cliDevice ?? process.env.PN532_DEVICE;
  if (device === undefined) {
    const devices = await scanNfcDevices(signal);
    device = devices[0] ?? DEFAULT_NFC_DEVICE;
  }
  device = device.trim();
  if (!device || device.includes("\0") || /[\r\n]/.test(device)) throw new Error("Invalid NFC device selection");
  const tty = /^tty:(.+):pn532$/.exec(device);
  if (tty) {
    const path = tty[1].startsWith("/dev/") ? tty[1] : `/dev/${tty[1].startsWith("tty") ? "" : "tty"}${tty[1]}`;
    return `pn532_uart:${path}`;
  }
  if (/^\/dev\/i2c-\d+$/.test(device)) return `pn532_i2c:${device}`;
  if (device.startsWith("/dev/")) return `pn532_uart:${device}`;
  const i2c = /^i2c:(?:\/dev\/i2c-)?(\d+)(?::pn532)?$/.exec(device);
  if (i2c) return `pn532_i2c:/dev/i2c-${i2c[1]}`;
  const usb = /^usb:(\d{1,3}):(\d{1,3})$/.exec(device);
  if (usb) {
    const matches = (await scanNfcDevices(signal)).filter((connstring) => {
      const native = /^(?:pn53x_usb|acr122_usb):(\d+):(\d+)$/.exec(connstring);
      return native !== null && Number(native[1]) === Number(usb[1]) && Number(native[2]) === Number(usb[2]);
    });
    if (matches.length === 0) throw new Error(`NFC USB selection missing or unsupported: ${device}`);
    if (matches.length !== 1) throw new Error(`Ambiguous NFC USB selection: ${device}`);
    return matches[0];
  }
  if (isNativeConnstring(device)) return device;
  throw new Error(`Unsupported NFC device selection: ${device}`);
}
