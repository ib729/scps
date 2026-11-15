import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { resolveDatabasePath } from "../../lib/database-path";
import { restoreDatabase } from "../../app/cli/db-commands";
import { extractBackup } from "../sqlite-snapshot";
import { createWebBackup } from "./web_backup";
import { assertWebStopped } from "./stopped-writers";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const usage = "Usage: node --import tsx tools/ops/restore_from_r2.ts <backup_filename.tar.zst> --writers-stopped";
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) { console.log(usage); return; }
  if (args.length !== 2 || args[1] !== "--writers-stopped" || !/^[^/\\\0\r\n]+\.tar\.zst$/.test(args[0])) throw new Error(usage);
  assertWebStopped();
  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), "scps-r2-restore-"));
  try {
    const archive = path.join(staging, "archive.tar.zst");
    const crypt = process.env.RCLONE_CRYPT_REMOTE || "r2-crypt";
    execFileSync("rclone", ["copyto", `${crypt}:${args[0]}`, archive], { stdio: "inherit" });
    const extracted = path.join(staging, "extracted");
    await fsp.mkdir(extracted, { mode: 0o700 });
    const source = await extractBackup(archive, extracted);
    const backups = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db_backups");
    await fsp.mkdir(backups, { recursive: true, mode: 0o700 });
    const before = await createWebBackup(path.join(backups, `pre_restore_backup_${Date.now()}_${process.pid}.tar.zst`));
    const activePath = resolveDatabasePath();
    const active = new Database(activePath, { fileMustExist: true });
    try { await restoreDatabase(source, activePath, active); }
    finally { active.close(); }
    console.log(`Restore complete; pre-restore snapshot: ${before}`);
  } finally { await fsp.rm(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string") process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  });
}
