import { existsSync, realpathSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { exitFailure, serialSelection } from "./check_usb_port";
import { command, probeReleasedReaders, startReaders, stopReaders } from "./recover-nfc";

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node --import tsx tools/ops/fix-readers.ts\nStop both broadcasters, refuse unmanaged serial owners, reload ch341 with calibration waits, verify native readers, then start services.");
    return;
  }
  if (args.length) throw new Error(`Unknown argument: ${args[0]}`);
  const ports = await serialSelection();
  const services = await stopReaders(ports);
  const stopped = new AbortController();
  let interrupted: NodeJS.Signals | undefined;
  const interrupt = () => { interrupted = "SIGINT"; stopped.abort(); };
  const terminate = () => { interrupted = "SIGTERM"; stopped.abort(); };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    try {
      await command("sudo", ["modprobe", "-r", "ch341"]);
      await delay(2000, undefined, { signal: stopped.signal });
    } finally { await command("sudo", ["modprobe", "ch341"]); }
    await delay(3000, undefined, { signal: stopped.signal });
    await probeReleasedReaders(ports);
    stopped.signal.throwIfAborted();
    await startReaders(services);
    await delay(2000, undefined, { signal: stopped.signal });
  } catch (error) {
    if (interrupted) throw Object.assign(new Error(`Driver repair interrupted by ${interrupted}`), { signal: interrupted });
    throw error;
  } finally { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); }
}

if (process.argv[1] && existsSync(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) main().catch(exitFailure);
