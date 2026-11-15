import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export async function autoUpdate(logFile = "/var/log/auto-update.log", failureFile = "/var/tmp/auto-update-failures"): Promise<void> {
  let failures = 0;
  try {
    const saved = fs.readFileSync(failureFile, "utf8").trim();
    if (!/^\d+$/.test(saved) || !Number.isSafeInteger(Number(saved))) throw new Error(`Invalid failure count in ${failureFile}`);
    failures = Number(saved);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  const descriptor = fs.openSync(logFile, "a", 0o600);
  const log = (message: string) => {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    fs.appendFileSync(descriptor, `${line}\n`);
  };
  try {
    log("Starting system update...");
    if (failures >= 3) {
      log(`ERROR: Too many failures (${failures}). Skipping update. Run 'sudo rm ${failureFile}' to reset.`);
      throw new Error("Automatic updates disabled after repeated failures");
    }
    try {
      for (const args of [["update"], ["upgrade", "-y"], ["autoremove", "-y"], ["autoclean"]]) {
        const child = spawn("apt", args, { stdio: ["inherit", descriptor, descriptor] });
        let interrupted: NodeJS.Signals | undefined;
        const interrupt = () => { interrupted = "SIGINT"; child.kill("SIGINT"); };
        const terminate = () => { interrupted = "SIGTERM"; child.kill("SIGTERM"); };
        process.on("SIGINT", interrupt);
        process.on("SIGTERM", terminate);
        const { promise, resolve, reject } = Promise.withResolvers<void>();
        child.once("error", reject);
        child.once("close", (status, signal) => {
          if (status === 0 && !interrupted) resolve();
          else reject(Object.assign(new Error(`apt ${args.join(" ")} failed (${interrupted ?? signal ?? status})`), { status, signal: interrupted ?? signal }));
        });
        try { await promise; }
        finally {
          process.off("SIGINT", interrupt);
          process.off("SIGTERM", terminate);
        }
      }
    } catch (error) {
      fs.writeFileSync(failureFile, `${failures + 1}\n`, { mode: 0o600 });
      log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
    fs.rmSync(failureFile, { force: true });
    log("System update completed successfully");
  } finally { fs.closeSync(descriptor); }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args[0] === "--help" || args[0] === "-h") {
    console.log("Usage: node --import tsx tools/ops/auto-update.ts\nRun apt update/upgrade/autoremove/autoclean, append /var/log/auto-update.log and stop after three consecutive failures. Intended for the existing weekly root cron job.");
    return;
  }
  if (args.length) throw new Error("auto-update.ts takes no arguments");
  await autoUpdate();
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string" && error.signal in os.constants.signals) process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  });
}
