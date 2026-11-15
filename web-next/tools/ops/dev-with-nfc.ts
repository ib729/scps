import fs from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";
import { assertReaderReleased, exitFailure, serialSelection } from "./check_usb_port";
import { command, readerServices, startReaders } from "./recover-nfc";

const web = fileURLToPath(new URL("../../", import.meta.url));

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node --import tsx tools/ops/dev-with-nfc.ts\nStop reader owners, reset selected USB adapters, wait for the development web server, then start the primary and previously active readers. Ctrl+C stops the web child but leaves reader services running, matching the existing workflow.");
    return;
  }
  if (args.length) throw new Error(`Unknown argument: ${args[0]}`);
  const environment = config({ path: fileURLToPath(new URL("../../.env.local", import.meta.url)), override: false, quiet: true });
  if (environment.error && environment.error.code !== "ENOENT") throw environment.error;
  const ports = await serialSelection();
  const installed: string[] = [];
  const previouslyActive = new Set<string>();
  for (const service of readerServices) {
    const load = execFileSync("systemctl", ["show", service, "-p", "LoadState", "--value"], { encoding: "utf8", timeout: 5000 }).trim();
    if (load === "not-found") continue;
    if (load !== "loaded") throw new Error(`Cannot establish ${service} ownership (${load})`);
    installed.push(service);
    const state = execFileSync("systemctl", ["show", service, "-p", "ActiveState", "--value"], { encoding: "utf8", timeout: 5000 }).trim();
    if (["active", "activating", "reloading"].includes(state)) previouslyActive.add(service);
    else if (!["inactive", "failed"].includes(state)) throw new Error(`Cannot establish ${service} state (${state})`);
  }
  if (!installed.includes("tap-broadcaster.service")) throw new Error("Install the primary broadcaster service before coordinated development startup");
  await command("sudo", ["systemctl", "stop", ...installed]);
  for (const service of installed) {
    const state = execFileSync("systemctl", ["show", service, "-p", "ActiveState", "--value"], { encoding: "utf8", timeout: 5000 }).trim();
    if (state !== "inactive" && state !== "failed") throw new Error(`${service} still owns its reader (${state})`);
  }
  for (const port of ports) {
    assertReaderReleased(port);
    await command("sudo", [process.execPath, "--import", "tsx", fileURLToPath(new URL("./reset-usb-nfc.ts", import.meta.url)), port]);
  }
  const child = spawn(process.execPath, ["--import", "tsx", "server.ts"], { cwd: web, env: { ...process.env, NODE_ENV: "development" }, stdio: "inherit" });
  const closed = Promise.withResolvers<{ status: number | null; signal: NodeJS.Signals | null }>();
  let startupError: Error | undefined;
  child.once("error", error => { startupError = error; });
  child.once("close", (status, signal) => closed.resolve({ status, signal }));
  const stopped = new AbortController();
  let interrupted: NodeJS.Signals | undefined;
  const onInt = () => { interrupted = "SIGINT"; stopped.abort(); child.kill("SIGINT"); };
  const onTerm = () => { interrupted = "SIGTERM"; stopped.abort(); child.kill("SIGTERM"); };
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  try {
    const url = `http://localhost:${process.env.PORT || "3000"}`;
    const deadline = performance.now() + 20000;
    for (;;) {
      stopped.signal.throwIfAborted();
      if (startupError) throw startupError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("Development web server exited before readiness");
      let ready = false;
      try { ready = (await fetch(`${url}/login`, { signal: AbortSignal.any([stopped.signal, AbortSignal.timeout(1000)]) })).ok; }
      catch { /* Connection/compilation may still be pending until the bounded deadline. */ }
      if (ready) break;
      if (performance.now() >= deadline) throw new Error("Development server was not ready within 20 seconds; reader services remain stopped");
      await delay(1000, undefined, { signal: stopped.signal });
    }
    await startReaders(installed.filter(service => service === "tap-broadcaster.service" || previouslyActive.has(service)));
    await delay(2000, undefined, { signal: stopped.signal });
    console.log(`Development web server ready at ${url} (PID ${child.pid}); reader services started, hardware health unverified. Ctrl+C stops web and leaves reader services running.`);
    const result = await closed.promise;
    if (interrupted || result.signal) throw Object.assign(new Error("Development web server interrupted"), { signal: interrupted ?? result.signal });
    if (result.status !== 0) throw Object.assign(new Error("Development web server failed"), { status: result.status ?? 1 });
  } catch (error) {
    if (interrupted) throw Object.assign(new Error(`Development startup interrupted by ${interrupted}`), { signal: interrupted });
    throw error;
  } finally {
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      const escalation = setTimeout(() => child.kill("SIGKILL"), 5000);
      try { await closed.promise; } finally { clearTimeout(escalation); }
    }
  }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) main().catch(exitFailure);
