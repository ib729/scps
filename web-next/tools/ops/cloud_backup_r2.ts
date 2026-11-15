import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createWebBackup } from "./web_backup";

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) { console.log("Usage: node --import tsx tools/ops/cloud_backup_r2.ts\nUses RCLONE_REMOTE, RCLONE_CRYPT_REMOTE and the crypt remote's configured R2_PATH."); return; }
  if (args.length) throw new Error("cloud_backup_r2.ts takes no arguments");
  const raw = process.env.RCLONE_REMOTE || "r2";
  const crypt = process.env.RCLONE_CRYPT_REMOTE || "r2-crypt";
  const bucket = process.env.R2_PATH || "stuco-db-backups";
  let remotes: string[];
  try { remotes = execFileSync("rclone", ["listremotes"], { encoding: "utf8" }).trim().split(/\r?\n/); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("rclone is required. Install with: sudo apt install rclone");
    throw error;
  }
  if (!remotes.includes(`${raw}:`)) throw new Error(`Raw rclone remote '${raw}' not configured. Run rclone config for Cloudflare S3, endpoint https://<account-id>.r2.cloudflarestorage.com, region auto.`);
  if (!remotes.includes(`${crypt}:`)) throw new Error(`Encrypted rclone remote '${crypt}' not configured. Run node --import tsx tools/ops/setup-r2-crypt.ts (raw path ${raw}:${bucket}).`);
  const now = new Date();
  const stamp = `${now.getFullYear()}${[now.getMonth() + 1, now.getDate()].map(value => String(value).padStart(2, "0")).join("")}_${[now.getHours(), now.getMinutes(), now.getSeconds()].map(value => String(value).padStart(2, "0")).join("")}`;
  const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db_backups");
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
  const archive = await createWebBackup(path.join(directory, `stuco_backup_${stamp}.tar.zst`));
  console.log(`Uploading encrypted backup to ${crypt}:`);
  try {
    execFileSync("rclone", ["copy", archive, `${crypt}:`, "--progress", "--metadata-set", `timestamp=${stamp}`, "--metadata-set", "type=database", "--metadata-set", "project=scps"], { stdio: "inherit" });
  } catch (error) { console.error(`Upload failed; local backup preserved at: ${archive}`); throw error; }
  const local = (await fsp.readdir(directory)).filter(name => name.endsWith(".tar.zst"));
  const sizes = await Promise.all(local.map(async name => (await fsp.stat(path.join(directory, name))).size));
  console.log(`Local backups: ${local.length} files (${sizes.reduce((sum, size) => sum + size, 0)} bytes total)`);
  const remoteFiles = execFileSync("rclone", ["ls", `${crypt}:`], { encoding: "utf8" }).trim();
  console.log(`R2 backups: ${remoteFiles ? remoteFiles.split(/\r?\n/).length : 0} files`);
  console.log(`Backup complete. Local: ${archive}\nRemote: ${crypt}:${path.basename(archive)}\nRestore: node --import tsx tools/ops/restore_from_r2.ts ${path.basename(archive)} --writers-stopped`);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string") process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  });
}
