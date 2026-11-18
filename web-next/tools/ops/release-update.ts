import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";

type State = "running" | "current" | "updated" | "failed" | "rolled_back" | "rollback_failed";
type Operations = {
  directory: string;
  trial: string;
  prepare(previous: string, stage: (message: string) => void): Promise<{ directory: string; revision: string } | null>;
  restart(): Promise<void>;
  healthy(release: string): Promise<boolean>;
};

function atomicWrite(file: string, write: (temporary: string) => void) {
  const temporary = `${file}.${randomUUID()}`;
  try {
    write(temporary);
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function status(directory: string, state: State, message: string) {
  console.log(message);
  atomicWrite(path.join(directory, "status.json"), (file) => {
    fs.writeFileSync(file, JSON.stringify({ state, message, at: new Date().toISOString() }), { mode: 0o600 });
  });
}

export function checkForUpdate(directory: string, currentRevision: () => string, remoteRevision: () => string, now = Date.now()) {
  const request = path.join(directory, "request");
  if (fs.existsSync(request)) return;
  const file = path.join(directory, "availability.json");
  if (fs.existsSync(file)) {
    const { checkedAt } = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof checkedAt === "number" && now - checkedAt < 30 * 24 * 60 * 60 * 1000) return;
  }
  const current = currentRevision();
  const remote = remoteRevision();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(remote)) throw new Error("Could not read the configured upstream revision");
  if (fs.existsSync(request) || current !== currentRevision()) return;
  atomicWrite(file, temporary => {
    fs.writeFileSync(temporary, JSON.stringify({ checkedAt: now, available: current !== remote }), { mode: 0o600 });
  });
}

export async function applyUpdate(ops: Operations) {
  const current = path.join(ops.directory, "current");
  const request = fs.readFileSync(path.join(ops.directory, "request"), "utf8");
  console.log("Update requested by:", request.trim());
  const stage = (message: string) => status(ops.directory, "running", message);
  stage("Checking the running release");
  const previous = fs.realpathSync(current);
  if (!await ops.healthy(previous)) throw new Error("The running service is not the confirmed, healthy release");
  stage("Fetching the configured release");
  const release = await ops.prepare(previous, stage);
  if (!release) {
    status(ops.directory, "current", "SCPS is already up to date.");
    fs.rmSync(path.join(ops.directory, "availability.json"), { force: true });
    return;
  }
  stage("Restarting SCPS to check the new release");
  fs.symlinkSync(release.directory, ops.trial);
  await ops.restart();
  if (!await ops.healthy(release.directory)) throw new Error("The new release did not become healthy");
  atomicWrite(current, (file) => fs.symlinkSync(release.directory, file));
  status(ops.directory, "updated", `SCPS updated to ${release.revision.slice(0, 12)}.`);
  fs.rmSync(path.join(ops.directory, "availability.json"), { force: true });
}

// systemd always invokes this after the worker, including on timeout or signal.
export async function finishUpdate(ops: Operations, succeeded: boolean) {
  const request = path.join(ops.directory, "request");
  if (!fs.existsSync(request)) return;
  try {
    if (fs.existsSync(ops.trial)) {
      const candidate = fs.realpathSync(ops.trial);
      const confirmed = fs.realpathSync(path.join(ops.directory, "current"));
      fs.unlinkSync(ops.trial);
      if (confirmed !== candidate) {
        try {
          await ops.restart();
          if (!await ops.healthy(confirmed)) throw new Error("Previous release did not recover");
          status(ops.directory, "rolled_back", "The update failed. The previous release is running again.");
        } catch (error) {
          console.error(error);
          status(ops.directory, "rollback_failed", "The update failed and SCPS could not restart. Check the service journal.");
        }
      } else if (!succeeded) {
        status(ops.directory, "updated", "SCPS switched to the new release successfully.");
      }
    } else if (!succeeded) {
      status(ops.directory, "failed", "The update stopped before switching releases. Check the service journal for details.");
    }
  } finally {
    fs.rmSync(request, { force: true });
  }
}

function command(file: string, args: string[], cwd: string, environment = process.env, capture = false, timeout = 15 * 60_000) {
  return execFileSync(file, args, {
    cwd, env: environment, encoding: "utf8", stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
    timeout,
  })?.trim() ?? "";
}

async function waitForLogin(port: number, isExpectedProcess: () => boolean, signal?: AbortSignal) {
  const deadline = Date.now() + 45_000;
  while (!signal?.aborted && Date.now() < deadline) {
    try {
      if (isExpectedProcess()) {
        const response = await fetch(`http://127.0.0.1:${port}/login`, { redirect: "manual", signal: AbortSignal.timeout(2000) });
        await response.body?.cancel();
        if (response.status === 200 && isExpectedProcess()) return true;
      }
    } catch { /* Wait for the service to bind and finish initializing. */ }
    await delay(500);
  }
  return false;
}

async function preflight(web: string, env: NodeJS.ProcessEnv) {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a preflight port");
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  listener.close(error => error ? reject(error) : resolve());
  await promise;
  const child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    cwd: web, env: { ...env, HOSTNAME: "127.0.0.1", PORT: String(address.port) }, stdio: "inherit",
  });
  const stopped = once(child, "exit");
  const polling = new AbortController();
  try {
    const ready = await Promise.race([waitForLogin(address.port, () => child.exitCode === null && child.signalCode === null, polling.signal), stopped.then(() => false)]);
    if (!ready) throw new Error("Candidate failed the isolated startup check");
  } finally {
    polling.abort();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      const forceStop = setTimeout(() => child.kill("SIGKILL"), 5000);
      try { await stopped; } finally { clearTimeout(forceStop); }
    }
  }
}

function main() {
  const directory = process.env.SCPS_UPDATE_DIR;
  if (!directory || !path.isAbsolute(directory)) throw new Error("Set SCPS_UPDATE_DIR to the dedicated update state directory");
  const trial = "/run/scps-update/trial";
  const baseline = path.resolve(import.meta.dirname, "../../..");
  const baselineEnv = path.join(baseline, "web-next", ".env.local");
  const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const git = (args: string[]) => command("git", args, baseline, gitEnv, true);
  const ref = `refs/heads/${process.env.SCPS_UPDATE_BRANCH || "main"}`;
  const revisionOf = (release: string) => {
    const revision = release === baseline ? git(["rev-parse", "HEAD"]) : fs.readFileSync(path.join(release, ".scps-revision"), "utf8");
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) throw new Error("Invalid confirmed release revision");
    return revision;
  };
  if (process.argv[2] === "check") {
    git(["check-ref-format", ref]);
    return checkForUpdate(directory, () => revisionOf(fs.realpathSync(path.join(directory, "current"))), () => git(["ls-remote", "--exit-code", "origin", ref]).split("\t")[0]);
  }
  const ops: Operations = {
    directory, trial,
    async prepare(previous, stage) {
      if (git(["status", "--porcelain"])) throw new Error("The deployment checkout is dirty");
      git(["check-ref-format", ref]);
      git(["fetch", "--no-tags", "origin", ref]);
      const revision = git(["rev-parse", "--verify", "FETCH_HEAD^{commit}"]);
      const old = revisionOf(previous);
      if (revision === old) return null;
      git(["merge-base", "--is-ancestor", old, revision]);
      const schemaPaths = ["migrations", "web-next/migrations", "web-next/lib/db.ts", "web-next/lib/customer-schema.ts", "web-next/lib/database-path.ts"];
      if (git(["diff", "--name-only", old, revision, "--", ...schemaPaths])) throw new Error("The release changes database schema or startup. Deploy it manually.");

      const config = parse(fs.readFileSync(baselineEnv));
      if (!path.isAbsolute(config.DATABASE_PATH ?? "") || !fs.existsSync(config.DATABASE_PATH)) {
        throw new Error("Updater requires an existing absolute DATABASE_PATH in the host .env.local");
      }
      const release = path.join(directory, previous === path.join(directory, "release-a") ? "release-b" : "release-a");
      fs.rmSync(release, { recursive: true, force: true });
      fs.mkdirSync(release, { mode: 0o700 });
      const archive = path.join(release, "source.tar");
      git(["archive", "--format=tar", `--output=${archive}`, revision]);
      command("tar", ["-xf", archive], release);
      fs.unlinkSync(archive);
      fs.writeFileSync(path.join(release, ".scps-revision"), revision, { flag: "wx", mode: 0o600 });
      const web = path.join(release, "web-next");
      if (fs.realpathSync(web) !== web || fs.readdirSync(web).some(name => /^\.env(?:$|\.)/.test(name) && !name.endsWith(".example"))) {
        throw new Error("Candidate must not ship runtime environment files");
      }

      const database = path.join(release, "preflight.sqlite");
      const db = new DatabaseSync(database);
      try {
        for (const file of ["migrations/schema.sql", "web-next/migrations/better_auth_schema.sql"]) {
          db.exec(fs.readFileSync(path.join(release, file), "utf8"));
        }
      } finally { db.close(); }
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH, HOME: process.env.HOME, CI: "1", NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production",
        DATABASE_PATH: database, BETTER_AUTH_SECRET: randomUUID() + randomUUID(), NFC_TAP_SECRET: randomUUID(),
        ...Object.fromEntries(Object.entries(config).filter(([key]) => key.startsWith("NEXT_PUBLIC_"))),
      };
      try {
        stage("Installing and building in a separate release directory");
        command("pnpm", ["install", "--frozen-lockfile", "--prod=false"], web, env);
        command("pnpm", ["build"], web, env);
        stage("Testing the new release with a temporary database");
        await preflight(web, env);
      } finally {
        for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(database + suffix, { force: true });
      }
      fs.symlinkSync(baselineEnv, path.join(web, ".env.local"));
      return { directory: release, revision };
    },
    async restart() {
      command("/usr/bin/sudo", ["-n", "/usr/bin/systemctl", "restart", "scps.service"], baseline, process.env, false, 60_000);
    },
    async healthy(release) {
      const port = Number(process.env.SCPS_UPDATE_PORT ?? parse(fs.readFileSync(baselineEnv)).PORT ?? 3000);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid update health-check port");
      const expected = path.join(release, "web-next");
      return await waitForLogin(port, () => {
        const pid = command("/usr/bin/systemctl", ["show", "--property=MainPID", "--value", "scps.service"], baseline, process.env, true, 3000);
        return /^[1-9]\d*$/.test(pid) && fs.realpathSync(`/proc/${pid}/cwd`) === expected;
      });
    },
  };
  return process.argv[2] === "finish" ? finishUpdate(ops, process.env.SERVICE_RESULT === "success") : applyUpdate(ops);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  Promise.resolve().then(main).catch(error => { console.error(error); process.exitCode = 1; });
}
