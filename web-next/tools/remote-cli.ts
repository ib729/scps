import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";

export function quoteRemote(argument: string): string {
  if (argument.includes("\0")) throw new Error("Remote arguments cannot contain NUL");
  return `'${argument.replaceAll("'", "'\\''")}'`;
}

export async function ssh(args: string[]): Promise<void> {
  const child = spawn("ssh", args, { stdio: "inherit" });
  let interrupted: NodeJS.Signals | undefined;
  const interrupt = () => { interrupted = "SIGINT"; child.kill("SIGINT"); };
  const terminate = () => { interrupted = "SIGTERM"; child.kill("SIGTERM"); };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  child.once("error", reject);
  child.once("close", (status, signal) => {
    if (status === 0 && !interrupted) resolve();
    else reject(Object.assign(new Error(`ssh failed (${interrupted ?? signal ?? status})`), { status, signal: interrupted ?? signal }));
  });
  try { await promise; }
  finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args[0] === "--help" || args[0] === "-h") {
    console.log("Usage: scps-remote-cli [command ...arguments]\nOpen the production CLI over ssh -t. Configure SCPS_VPS_HOST, SCPS_VPS_USER, SCPS_VPS_DIR (default /var/www/scps), SCPS_VPS_PORT and SCPS_VPS_SSH_KEY in the environment or web-next/.env.local. Missing host and username are prompted interactively.");
    return;
  }
  const envFile = path.resolve(import.meta.dirname, "../.env.local");
  if (fs.existsSync(envFile)) {
    const result = dotenv.config({ path: envFile, quiet: true });
    if (result.error) throw result.error;
  }
  for (const name of ["HOST", "USER", "DIR", "PORT", "SSH_KEY"]) {
    if (/[\0\r\n]/.test(process.env[`SCPS_VPS_${name}`] ?? "")) throw new Error(`SCPS_VPS_${name} must be a single line`);
  }
  let host = process.env.SCPS_VPS_HOST || "";
  let user = process.env.SCPS_VPS_USER || os.userInfo().username;
  const directory = process.env.SCPS_VPS_DIR || "/var/www/scps";
  const port = process.env.SCPS_VPS_PORT || "22";
  const key = process.env.SCPS_VPS_SSH_KEY || "";
  console.log("┌──────────────────────────────────────────────┐\n│         SCPS REMOTE PRODUCTION CLI           │\n└──────────────────────────────────────────────┘");
  if (!host) {
    console.log(`[Warning] Remote Production VPS Host is not configured!\nAdd SCPS_VPS_HOST, SCPS_VPS_USER and SCPS_VPS_DIR to ${envFile}.`);
    const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
    const answers = input[Symbol.asyncIterator]();
    try {
      process.stdout.write("Enter remote VPS IP or Hostname to proceed: ");
      host = (await answers.next()).value ?? "";
      if (!host) throw new Error("Connection cancelled. Host is required.");
      process.stdout.write(`Enter SSH Username (default: ${user}): `);
      user = (await answers.next()).value || user;
    } finally { input.close(); }
  }
  if (host.startsWith("-") || !/^[A-Za-z0-9_.:[\]-]+$/.test(host)) throw new Error("Invalid SSH host");
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*\$?$/.test(user)) throw new Error("Invalid SSH username");
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("Invalid SSH port");
  const sshArgs = ["-p", port];
  if (key) {
    const keyPath = key === "~" ? os.homedir() : key.startsWith("~/") ? path.join(os.homedir(), key.slice(2)) : key;
    if (fs.existsSync(keyPath) && fs.statSync(keyPath).isFile()) sshArgs.push("-i", keyPath);
    else console.warn(`[Warning] Configured SSH key not found at: ${keyPath}`);
  }
  const target = `${user}@${host}`;
  const command = `cd -- ${quoteRemote(directory)} && ${["./scps-cli", ...args].map(quoteRemote).join(" ")}`;
  console.log(`Connecting to ${target} on port ${port}...\nDirectory: ${directory}`);
  await ssh([...sshArgs, "-t", "--", target, command]);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string" && error.signal in os.constants.signals) process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  });
}
