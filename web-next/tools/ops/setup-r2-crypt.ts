import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) { console.log("Usage: node --import tsx tools/ops/setup-r2-crypt.ts\nConfigure RCLONE_REMOTE (r2), RCLONE_CRYPT_REMOTE (r2-crypt), R2_PATH (stuco-db-backups); prompts hide passwords."); return; }
  if (args.length) throw new Error("setup-r2-crypt.ts takes no arguments");
  const raw = process.env.RCLONE_REMOTE || "r2";
  const crypt = process.env.RCLONE_CRYPT_REMOTE || "r2-crypt";
  const bucket = process.env.R2_PATH || "stuco-db-backups";
  const listing = spawnSync("rclone", ["listremotes"], { encoding: "utf8" });
  if (listing.error) throw new Error("rclone is required. Install it first with: sudo apt install rclone");
  if (listing.status !== 0 || listing.signal) throw Object.assign(new Error("Unable to list rclone remotes"), { status: listing.status, signal: listing.signal });
  const remotes = listing.stdout.trim().split(/\r?\n/);
  console.log(`SCPS Cloudflare R2 encrypted backup setup\nRaw remote: ${raw}\nEncrypted remote: ${crypt}`);
  let hidden = false;
  const output = new Writable({ write(chunk: Buffer, _encoding, done) { if (!hidden) process.stdout.write(chunk); done(); } });
  const input = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
  const lines = process.stdin.isTTY ? undefined : input[Symbol.asyncIterator]();
  const cancelled = new AbortController();
  const onInt = () => { cancelled.abort(Object.assign(new Error("Setup interrupted"), { signal: "SIGINT" })); input.close(); };
  const onTerm = () => { cancelled.abort(Object.assign(new Error("Setup interrupted"), { signal: "SIGTERM" })); input.close(); };
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  input.on("SIGINT", onInt);
  if (!lines) input.once("close", () => cancelled.abort(new Error("Setup cancelled: input ended")));
  async function prompt(label: string, secret = false): Promise<string> {
    cancelled.signal.throwIfAborted();
    process.stdout.write(`${label}: `);
    hidden = secret;
    try {
      if (lines) {
        const answer = await lines.next();
        if (answer.done) throw new Error("Setup cancelled: input ended");
        return answer.value;
      }
      return await input.question("", { signal: cancelled.signal });
    } catch (error) { if (cancelled.signal.aborted) throw cancelled.signal.reason; throw error; }
    finally { hidden = false; if (secret) process.stdout.write("\n"); }
  }
  try {
    const password = await prompt("rclone crypt password", true);
    const salt = await prompt("rclone crypt salt (second password, can be different)", true);
    const changes: string[][] = [];
    if (!remotes.includes(`${raw}:`)) {
      console.log(`Raw remote '${raw}' does not exist yet. Creating it now.`);
      const account = await prompt("Cloudflare Account ID");
      const access = await prompt("R2 Access Key ID");
      const secret = await prompt("R2 Secret Access Key", true);
      changes.push(["config", "create", raw, "s3", "provider", "Cloudflare", "env_auth", "false", "access_key_id", access, "secret_access_key", secret, "endpoint", `https://${account}.r2.cloudflarestorage.com`, "region", "auto", "acl", "private"]);
    } else console.log(`Using existing raw remote '${raw}'.`);
    changes.push(["config", "create", crypt, "crypt", "remote", `${raw}:${bucket}`, "filename_encryption", "standard", "directory_name_encryption", "true", "password", password, "password2", salt, "--obscure"]);
    for (const command of changes) {
      cancelled.signal.throwIfAborted();
      // rclone's error text can contain credential arguments; never forward it.
      const result = spawnSync("rclone", command, { stdio: "ignore" });
      if (result.error || result.status !== 0 || result.signal) throw Object.assign(new Error("rclone configuration failed; no credentials were logged"), { status: result.status, signal: result.signal });
    }
    console.log(`Configured R2 remotes successfully.\nRaw remote: ${raw}:${bucket}\nCrypt remote: ${crypt}:\nList: rclone ls ${crypt}:\nBackup: node --import tsx tools/ops/cloud_backup_r2.ts\nRestore: node --import tsx tools/ops/restore_from_r2.ts <backup.tar.zst> --writers-stopped`);
  } finally {
    hidden = false;
    input.close();
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
  }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string") process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  });
}
