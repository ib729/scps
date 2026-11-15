import fs from "node:fs";
import { execFile } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { readCardUid, resolveNfcDevice } from "./nfc-reader";
import { NFC_TIMEOUT_MS } from "./config";

export function runObservation(command: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise(resolve => {
    execFile(command, args, { encoding: "utf8", timeout: 5000, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024, env: { ...process.env, LC_ALL: "C" } }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: [stdout.trim(), stderr.trim(), error?.message].filter(Boolean).join("\n") });
    });
  });
}

export async function listSerialPorts(): Promise<string[]> {
  const result = await runObservation("ls", ["-1", "/dev"]);
  if (!result.ok) throw new Error(`Unable to list serial ports: ${result.output}`);
  return result.output.split("\n").filter(name => /^tty(?:USB|ACM)\d+$/.test(name)).sort().map(name => `/dev/${name}`);
}

export async function probeReader(device: string): Promise<{ ok: boolean; uid: string | null; error?: string }> {
  const signal = AbortSignal.timeout(NFC_TIMEOUT_MS);
  try {
    const selected = await resolveNfcDevice(device, signal);
    return { ok: true, uid: await readCardUid(selected, signal) };
  } catch (error) {
    return { ok: false, uid: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node --import tsx hardware/diagnose-nfc.ts\nObserve USB, serial ports, kernel drivers/messages and optionally probe one reader (5-second deadline plus child cleanup). Stop broadcaster services before probing.");
    return;
  }
  if (args.length) throw new Error(`Unknown argument: ${args[0]}`);
  console.log("NFC Reader Hardware Diagnostic Tool\n===================================");
  const usb = await runObservation("lsusb", []);
  console.log(`\n=== USB Devices ===\n${usb.output || "No USB devices reported"}`);
  const count = usb.ok ? usb.output.split("\n").filter(line => /CH34[01]|1a86:/i.test(line)).length : null;
  console.log(count === null ? "USB enumeration failed; adapter count is unknown" : `Found ${count} CH340/CH341 adapter identifier(s)`);
  const ports = await listSerialPorts();
  console.log(`\n=== Serial Ports ===\n${ports.join("\n") || "No ttyUSB/ttyACM devices found"}`);
  if (ports.length) console.log((await runObservation("ls", ["-l", ...ports])).output);
  const uart = await runObservation("find", ["/dev", "-maxdepth", "1", "-name", "ttyAMA*", "-print"]);
  console.log(`Raspberry Pi UART ports:\n${uart.output || "No ttyAMA devices found"}`);
  const modules = await runObservation("lsmod", []);
  console.log("\n=== Kernel Modules ===");
  if (!modules.ok) console.log(modules.output);
  else for (const driver of ["ch341", "usbserial", "ftdi_sio"]) console.log(`${driver}: ${new RegExp(`^${driver}\\s`, "m").test(modules.output) ? "loaded" : "not loaded"}`);
  const kernel = await runObservation("dmesg", []);
  const recent = kernel.output.split("\n").filter(line => /usb|tty|ch340|ch341/i.test(line)).slice(-30);
  console.log(`\n=== Recent USB Events ===\n${kernel.ok ? recent.join("\n") || "No recent USB events found" : kernel.output}`);
  const input = createInterface({ input: process.stdin, output: process.stdout });
  const lines = input[Symbol.asyncIterator]();
  try {
    process.stdout.write("\nWould you like to test a specific NFC reader? (y/n): ");
    const answer = await lines.next();
    if (!answer.done && answer.value.trim().toLowerCase() === "y") {
      process.stdout.write("Enter port (tty:USB0:pn532, tty:AMA0:pn532, i2c:/dev/i2c-1:pn532 or native connstring): ");
      const port = await lines.next();
      if (!port.done && port.value.trim()) {
        const result = await probeReader(port.value.trim());
        console.log(result.ok ? `Reader opened successfully${result.uid ? `; UID: ${result.uid}` : "; no card detected"}` : `Reader failed: ${result.error}`);
        if (!result.ok) process.exitCode = 1;
      }
    }
  } finally { input.close(); }
  console.log("\nDIAGNOSTIC SUMMARY & RECOMMENDATIONS");
  if (count === 0) console.log("No CH340 adapters detected: check the USB cable, another port, and powered-hub supply.");
  else if (count !== null && !ports.some(port => /ttyUSB/.test(port))) console.log("CH340 detected without ttyUSB ports: inspect ch341 driver and dmesg; the adapter may be faulty.");
  console.log("1. Compare another physical USB port, then inspect lsusb, serial devices and dmesg.\n2. Keep the PN532 reader and swap CH340 adapters to isolate an adapter fault.\n3. Keep the adapter and swap PN532 readers to isolate a reader fault.\n4. UART wiring: verify module voltage/jumpers, common GND, and crossed TXD/RXD.\n5. To power-cycle manually, unplug USB, wait 10 seconds, reconnect and inspect kernel messages.");
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
