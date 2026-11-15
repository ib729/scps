import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

async function usbParent(tty: string): Promise<{ tty: string; name: string; vendor: string }> {
  let directory = await fsp.realpath(`/sys/class/tty/${tty}/device`);
  while (directory !== path.dirname(directory)) {
    const name = path.basename(directory);
    if (/^\d+-\d+(?:\.\d+)*$/.test(name)) {
      const [vendor, product, canonical] = await Promise.all([
        fsp.readFile(path.join(directory, "idVendor"), "utf8"),
        fsp.readFile(path.join(directory, "idProduct"), "utf8"),
        fsp.realpath(`/sys/bus/usb/devices/${name}`),
      ]);
      if (canonical !== directory || !/^[\da-f]{4}\s*$/i.test(vendor) || !/^[\da-f]{4}\s*$/i.test(product)) throw new Error(`Invalid USB ancestor for ${tty}`);
      return { tty, name, vendor: vendor.trim().toLowerCase() };
    }
    directory = path.dirname(directory);
  }
  throw new Error(`No USB device ancestor for ${tty}`);
}

export async function resetUsbNfc(device?: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  let ttys: string[];
  if (device !== undefined) {
    const selected = /^(?:\/dev\/)?(?:tty)?(USB\d+|ACM\d+)$/.exec(device)?.[1] ?? (/^\d+$/.test(device) ? `USB${device}` : undefined);
    if (!selected) throw new Error(`Invalid USB serial selector: ${device}`);
    ttys = [`tty${selected}`];
  } else {
    ttys = (await fsp.readdir("/sys/class/tty")).filter(name => /^tty(?:USB|ACM)\d+$/.test(name)).sort();
  }
  if (!ttys.length) throw new Error("No USB serial devices found");
  const candidates = await Promise.all(ttys.map(usbParent));
  const devices = device === undefined && candidates.some(candidate => candidate.vendor === "1a86") ? candidates.filter(candidate => candidate.vendor === "1a86") : candidates;
  const reset = new Set<string>();
  for (const selected of devices) {
    signal?.throwIfAborted();
    if (!reset.has(selected.name)) {
      console.log(`[USB RESET] ${selected.tty} uses USB device ${selected.name}`);
      execFileSync("sudo", ["tee", "/sys/bus/usb/drivers/usb/unbind"], { input: selected.name + "\n", stdio: ["pipe", "ignore", "inherit"] });
      try {
        await delay(2000, undefined, { signal });
      } finally {
        // Always rebind an unbound device, including interrupted settling waits.
        execFileSync("sudo", ["tee", "/sys/bus/usb/drivers/usb/bind"], { input: selected.name + "\n", stdio: ["pipe", "ignore", "inherit"] });
      }
      reset.add(selected.name);
      await delay(1000, undefined, { signal });
    }
    const deadline = performance.now() + 5000;
    for (;;) {
      signal?.throwIfAborted();
      try { await fsp.access(`/dev/${selected.tty}`); break; }
      catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
        if (performance.now() >= deadline) throw new Error(`${selected.tty} did not reappear after reset`);
        await delay(500, undefined, { signal });
      }
    }
    console.log(`[USB RESET] ${selected.tty} is ready`);
  }
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node --import tsx tools/ops/reset-usb-nfc.ts [USB0|USB1|ttyUSBn|/dev/ttyUSBn]\nStop reader owners first. Without an argument, reset CH340 TTY devices (otherwise generic USB serial), following each TTY's actual sysfs ancestry.");
    return 0;
  }
  if (args.length > 1) throw new Error("Expected at most one USB serial selector");
  const stopped = new AbortController();
  let interrupted: NodeJS.Signals | undefined;
  const onInterrupt = () => { interrupted = "SIGINT"; stopped.abort(); };
  const onTerminate = () => { interrupted = "SIGTERM"; stopped.abort(); };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try { await resetUsbNfc(args[0], stopped.signal); return 0; }
  catch (error) { if (interrupted) { console.error(error); return 128 + os.constants.signals[interrupted]; } throw error; }
  finally { process.off("SIGINT", onInterrupt); process.off("SIGTERM", onTerminate); }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string" && error.signal in os.constants.signals) process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  });
}
