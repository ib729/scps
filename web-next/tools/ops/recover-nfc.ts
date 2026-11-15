import { spawn, execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { probeReader } from "../../hardware/diagnose-nfc";
import { assertReaderReleased, exitFailure, serialSelection } from "./check_usb_port";

export const readerServices = ["tap-broadcaster.service", "tap-broadcaster-reader2.service"];
const packageDirectory = fileURLToPath(new URL("../../", import.meta.url));

export async function command(program: string, args: string[]): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const child = spawn(program, args, { cwd: packageDirectory, stdio: "inherit" });
  let interrupted: NodeJS.Signals | undefined;
  const interrupt = () => { interrupted = "SIGINT"; child.kill("SIGINT"); };
  const terminate = () => { interrupted = "SIGTERM"; child.kill("SIGTERM"); };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  child.once("error", reject);
  child.once("close", (status, signal) => {
    if (interrupted || signal) reject(Object.assign(new Error(`${program} interrupted by ${interrupted ?? signal}`), { signal: interrupted ?? signal }));
    else if (status !== 0) reject(Object.assign(new Error(`${program} exited with status ${status}`), { status: status ?? 1 }));
    else resolve();
  });
  try { await promise; }
  finally { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); }
}

export async function stopReaders(ports: string[]): Promise<string[]> {
  const services: string[] = [];
  for (const service of readerServices) {
    const load = execFileSync("systemctl", ["show", service, "-p", "LoadState", "--value"], { encoding: "utf8", timeout: 5000 }).trim();
    if (load === "loaded") services.push(service);
    else if (load !== "not-found") throw new Error(`Cannot establish ${service} ownership (load state ${load})`);
  }
  if (!services.length) throw new Error("No broadcaster services installed; establish reader ownership before recovery");
  await command("sudo", ["systemctl", "stop", ...services]);
  for (const service of services) {
    const state = execFileSync("systemctl", ["show", service, "-p", "ActiveState", "--value"], { encoding: "utf8", timeout: 5000 }).trim();
    if (state !== "inactive" && state !== "failed") throw new Error(`${service} still owns its reader (state ${state})`);
  }
  for (const port of ports) assertReaderReleased(port);
  return services;
}

export async function startReaders(services: string[]): Promise<void> {
  await command("sudo", ["systemctl", "start", ...services]);
  for (const service of services) {
    const state = execFileSync("systemctl", ["show", service, "-p", "ActiveState", "--value"], { encoding: "utf8", timeout: 5000 }).trim();
    if (state !== "active") throw new Error(`${service} did not become active (state ${state}); hardware recovery is not confirmed`);
  }
  console.log("Reader services started. Active services alone do not prove hardware health; verify a real tap on each reader.");
}

export async function probeReleasedReaders(ports: string[]): Promise<void> {
  for (const port of ports) {
    assertReaderReleased(port);
    const result = await probeReader(`pn532_uart:${port}`);
    if (!result.ok) throw new Error(`${port} communication failed: ${result.error}`);
    console.log(`${port}: native NFC communication verified${result.uid ? " (card detected)" : " (no card)"}`);
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node --import tsx tools/ops/recover-nfc.ts [USB0|USB1|/dev/ttyUSBn]\nStop both reader owners, reset actual selected USB ancestry, settle, probe, then start services. Any failure leaves services stopped; unmanaged owners must be released manually.");
    return;
  }
  if (args.length > 1) throw new Error("Expected at most one USB serial selector");
  const ports = await serialSelection(args[0]);
  const services = await stopReaders(ports);
  // A child owns reset cleanup: forwarded interrupts wait for its USB rebind before exiting.
  for (const port of ports) await command("sudo", [process.execPath, "--import", "tsx", fileURLToPath(new URL("./reset-usb-nfc.ts", import.meta.url)), port]);
  await delay(3000);
  await probeReleasedReaders(ports);
  await startReaders(services);
}

if (process.argv[1] && existsSync(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) main().catch(exitFailure);
