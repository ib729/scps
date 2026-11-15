import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import Database from "better-sqlite3";
import { Command } from "commander";
import { resolveDatabasePath } from "../lib/database-path";
import { migrateCustomerSchema } from "../lib/customer-schema";

async function main() {
  const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const env = config({ path: path.join(webDirectory, ".env.local"), override: false, quiet: true });
  if (env.error && env.error.code !== "ENOENT") throw env.error;
  const program = new Command().description("Atomically migrate the stopped SCPS ledger and account roles to customer naming")
    .requiredOption("--writers-stopped", "Assert every writer is stopped; arbitrary external writers cannot be detected");
  program.parse();
  const service = spawnSync("systemctl", ["show", "--property=ActiveState", "--value", "stuco-web.service"], { encoding: "utf8" });
  if (service.error && (service.error as NodeJS.ErrnoException).code !== "ENOENT") throw service.error;
  if (service.status === 0 && /^(active|activating|reloading)$/m.test(service.stdout.trim())) throw new Error("Stop stuco-web.service before migrating");
  if (service.error || service.status !== 0) console.warn("Local systemd service state unavailable; --writers-stopped must cover every writer.");
  console.warn("This command cannot detect arbitrary external writers; --writers-stopped asserts that all are stopped.");
  const databasePath = resolveDatabasePath();
  const database = new Database(databasePath, { fileMustExist: true });
  const backupPath = `${databasePath}.pre-customer-${Date.now()}-${process.pid}.db`;
  try {
    database.pragma("foreign_keys=ON");
    fs.closeSync(fs.openSync(backupPath, "wx", 0o600));
    await database.backup(backupPath);
    const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
    try {
      if (backup.pragma("integrity_check", { simple: true }) !== "ok" || (backup.pragma("foreign_key_check") as unknown[]).length) throw new Error(`Pre-migration backup failed verification: ${backupPath}`);
    } finally { backup.close(); }
    console.log(`Verified pre-migration backup: ${backupPath}`);
    migrateCustomerSchema(database);
    console.log(`Customer schema ready: ${databasePath}`);
  } finally { database.close(); }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
