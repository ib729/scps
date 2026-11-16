import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "dotenv";
import Database from "better-sqlite3";
import { resolveDatabasePath } from "../../lib/database-path";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const web = path.join(repository, "web-next");
const envFile = path.join(web, ".env.local");
const appUser = process.env.SUDO_USER || os.userInfo().username;

export function runAsUser(command: string, args: string[], cwd = web): void {
  execFileSync("sudo", ["-u", appUser, "env", "-u", "SUDO_USER", `PATH=${process.env.PATH ?? "/usr/bin:/bin"}`, command, ...args], { cwd, stdio: "inherit" });
}

export function readEnvValue(key: string): string {
  if (!fs.existsSync(envFile)) return "";
  return parse(fs.readFileSync(envFile))[key] ?? "";
}

export function ensureEnvValue(key: string, value: string): void {
  const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").split(/\r?\n/) : [];
  if (lines.at(-1) === "") lines.pop();
  const assignment = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*(?:=|:\\s)`);
  const filtered = lines.filter(line => !assignment.test(line));
  filtered.push(`${key}=${value}`);
  const temporary = `${envFile}.tmp-${randomUUID()}`;
  try {
    fs.writeFileSync(temporary, filtered.join("\n") + "\n", { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, envFile);
  } finally { fs.rmSync(temporary, { force: true }); }
}

export function configureDatabase(): string {
  const previous = process.env.DATABASE_PATH;
  const configured = fs.existsSync(envFile) ? parse(fs.readFileSync(envFile)).DATABASE_PATH : undefined;
  if (previous === undefined && configured !== undefined) process.env.DATABASE_PATH = configured;
  let target: string;
  try { target = resolveDatabasePath(); }
  finally { if (previous === undefined) delete process.env.DATABASE_PATH; }
  ensureEnvValue("DATABASE_PATH", JSON.stringify(target));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) {
    const temporary = path.join(path.dirname(target), `.scps-init-${randomUUID()}`);
    const descriptor = fs.openSync(temporary, "wx", 0o600);
    let database: Database.Database | undefined;
    try {
      fs.closeSync(descriptor);
      database = new Database(temporary);
      database.pragma("foreign_keys = ON");
      database.transaction(() => {
        database!.exec(fs.readFileSync(path.join(repository, "migrations/schema.sql"), "utf8"));
        database!.exec(fs.readFileSync(path.join(web, "migrations/better_auth_schema.sql"), "utf8"));
      })();
      if (database.pragma("integrity_check", { simple: true }) !== "ok" || (database.pragma("foreign_key_check") as unknown[]).length) throw new Error("Initialized database failed integrity checks");
      database.close();
      database = undefined;
      fs.linkSync(temporary, target);
    } finally {
      database?.close();
      fs.rmSync(temporary, { force: true });
      fs.rmSync(`${temporary}-journal`, { force: true });
      fs.rmSync(`${temporary}-wal`, { force: true });
      fs.rmSync(`${temporary}-shm`, { force: true });
    }
    console.log(`Initialized SQLite database at ${target}`);
  } else console.log(`Preserving existing database at ${target}; legacy schemas require the explicit stopped-writer migration.`);
  return target;
}

function unitValue(value: string): string {
  if (/[\0\r\n]/.test(value)) throw new Error("Systemd paths/user/environment must be single-line values");
  return value.replaceAll("%", "%%").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function main(args = process.argv.slice(2)): number {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: ./scripts/setup.sh [--systemd|--no-systemd]\nConfigures env/database and builds; service installation is optional. Existing ledgers are preserved.");
    return 0;
  }
  if (args.length !== 1 || !["--systemd", "--no-systemd"].includes(args[0])) throw new Error("Specify --systemd or --no-systemd");
  const release = parse(fs.readFileSync("/etc/os-release", "utf8"));
  if (![release.ID, ...(release.ID_LIKE ?? "").split(/\s+/)].some(value => value === "debian" || value === "raspbian" || value === "ubuntu")) throw new Error("This setup supports Debian and Ubuntu based Linux hosts only");
  if (os.userInfo().username !== appUser) {
    runAsUser(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), ...args]);
    return 0;
  }
  const managed = ["scps.service", "scps-reader.service", "scps-reader2.service"];
  const legacy = ["stuco-web.service", "tap-broadcaster.service", "tap-broadcaster-reader2.service"];
  const installedLegacy: string[] = [];
  const rendered = new Map<string, string>();
  if (args[0] === "--systemd") {
    try {
      if (!execFileSync("systemctl", ["show", "--property=Version", "--value"], { encoding: "utf8" }).trim()) throw new Error("empty manager version");
      execFileSync("systemd-analyze", ["--version"], { stdio: "ignore" });
    } catch { throw new Error("systemd is unavailable; use --no-systemd"); }
  }
  const replacements: [string, string][] = [
    ["__RUN_USER__", unitValue(appUser)], ["__ENV_FILE__", path.join(repository, ".env.broadcaster").replaceAll("%", "%%").replaceAll("\\", "\\\\")],
    ["__NODE_EXEC__", unitValue(process.execPath)], ["__RUN_PATH__", unitValue(process.env.PATH ?? "/usr/bin:/bin")],
    ["__WORKING_DIR__", (() => { if (/[\0\r\n]/.test(web)) throw new Error("Systemd paths must be single-line values"); return web.replaceAll("%", "%%").replaceAll("\\", "\\\\"); })()],
  ];
  if (args[0] === "--systemd") {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "scps-units-"));
    try {
      for (const name of managed) {
        let unit = fs.readFileSync(path.join(repository, "systemd", name), "utf8");
        for (const [placeholder, value] of replacements) unit = unit.replaceAll(placeholder, value);
        rendered.set(name, unit);
        fs.writeFileSync(path.join(staging, name), unit);
      }
      execFileSync("systemd-analyze", ["verify", ...managed.map(name => path.join(staging, name))], { stdio: "inherit" });
    } finally { fs.rmSync(staging, { recursive: true, force: true }); }
    for (const name of [...legacy, ...managed]) {
      const props: Record<string, string> = {};
      for (const property of ["LoadState", "FragmentPath", "DropInPaths", "WorkingDirectory"]) {
        props[property] = execFileSync("systemctl", ["show", `--property=${property}`, "--value", name], { encoding: "utf8" }).trim();
        if (property === "LoadState" && props[property] === "not-found") break;
      }
      if (props.LoadState === "not-found") continue;
      if (props.LoadState !== "loaded" || !props.FragmentPath || !props.WorkingDirectory) throw new Error(`Cannot establish ownership of ${name}: ${JSON.stringify(props)}`);
      if (path.resolve(props.WorkingDirectory) !== path.resolve(web) || (legacy.includes(name) && props.DropInPaths)) {
        throw new Error(`Cannot replace ${name}: fragment ${props.FragmentPath}, working directory ${props.WorkingDirectory}, drop-ins ${props.DropInPaths || "(none)"}; migrate overrides to the chosen new name manually`);
      }
      if (legacy.includes(name)) installedLegacy.push(name);
    }
  }
  const freshEnv = !fs.existsSync(envFile);
  if (freshEnv) fs.copyFileSync(path.join(web, ".env.local.example"), envFile, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(envFile, 0o600);
  if (freshEnv) {
    ensureEnvValue("PORT", "38173");
    ensureEnvValue("NEXT_PUBLIC_APP_URL", "http://localhost:38173");
    ensureEnvValue("TRUSTED_ORIGINS", "http://localhost:38173");
  }
  configureDatabase();
  const secret = readEnvValue("BETTER_AUTH_SECRET");
  if (!secret || secret === "replace-with-a-random-secret") {
    ensureEnvValue("BETTER_AUTH_SECRET", randomBytes(32).toString("base64"));
    console.log("Generated BETTER_AUTH_SECRET (value not logged)");
  }
  else ensureEnvValue("BETTER_AUTH_SECRET", JSON.stringify(secret));
  if (!readEnvValue("NEXT_PUBLIC_APP_URL")) ensureEnvValue("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  const origins = readEnvValue("TRUSTED_ORIGINS");
  if (!origins || origins === "http://localhost:3000") ensureEnvValue("TRUSTED_ORIGINS", readEnvValue("NEXT_PUBLIC_APP_URL"));
  runAsUser("env", ["NEXT_TELEMETRY_DISABLED=1", "pnpm", "--dir", web, "build"]);
  if (args[0] === "--no-systemd") {
    console.log(`SCPS setup complete. Start manually with: cd ${web} && pnpm start`);
    return 0;
  }
  for (const name of installedLegacy) {
    execFileSync("sudo", ["systemctl", "stop", name], { stdio: "inherit" });
    execFileSync("sudo", ["systemctl", "disable", name], { stdio: "inherit" });
    const state = execFileSync("systemctl", ["show", "--property=ActiveState", "--value", name], { encoding: "utf8" }).trim();
    if (state !== "inactive" && state !== "failed") throw new Error(`Failed to stop ${name}: ${state || "unknown state"}`);
  }
  for (const name of managed) {
    execFileSync("sudo", ["tee", `/etc/systemd/system/${name}`], { input: rendered.get(name)!, stdio: ["pipe", "ignore", "inherit"] });
  }
  execFileSync("sudo", ["systemctl", "daemon-reload"], { stdio: "inherit" });
  execFileSync("systemd-analyze", ["verify", ...managed.map(name => `/etc/systemd/system/${name}`)], { stdio: "inherit" });
  execFileSync("sudo", ["systemctl", "enable", "scps.service"], { stdio: "inherit" });
  execFileSync("sudo", ["systemctl", "restart", "scps.service"], { stdio: "inherit" });
  execFileSync("sudo", ["systemctl", "--no-pager", "--full", "status", "scps.service"], { stdio: "inherit" });
  console.log(`SCPS setup complete.\nEdit ${envFile} for the public URL and trusted origins, then restart scps.service.\nFor readers, set NEXTJS_URL=${readEnvValue("NEXT_PUBLIC_APP_URL")} and the matching NFC_TAP_SECRET in .env.broadcaster; configure serial permissions and USB reset privileges before enabling a reader.\nEncrypted backups: node --import tsx tools/ops/setup-r2-crypt.ts\nFuture deploy: node --import tsx tools/ops/deploy-vps.ts`);
  return 0;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try { process.exitCode = main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string" && error.signal in os.constants.signals) process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  }
}
