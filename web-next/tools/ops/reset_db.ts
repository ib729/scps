import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";
import Database from "better-sqlite3";
import { resolveDatabasePath } from "../../lib/database-path";
import { assertCustomerSchema } from "../../lib/customer-schema";
import { backupDatabase } from "../sqlite-snapshot";
import { assertWebStopped } from "./stopped-writers";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const usage = "Usage: node --import tsx tools/ops/reset_db.ts --writers-stopped";
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) { console.log(usage); return; }
  if (args.length !== 1 || args[0] !== "--writers-stopped") throw new Error(usage);
  const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const environment = config({ path: path.join(web, ".env.local"), override: false, quiet: true });
  if (environment.error && environment.error.code !== "ENOENT") throw environment.error;
  const schema = fs.readFileSync(path.resolve(web, "../migrations/schema.sql"), "utf8") + "\n" + fs.readFileSync(path.join(web, "migrations/better_auth_schema.sql"), "utf8");
  assertWebStopped();
  console.warn("WARNING: this will DELETE all existing ledger data and authentication accounts!");
  const input = createInterface({ input: process.stdin, output: process.stdout });
  input.once("SIGINT", () => { input.close(); process.kill(process.pid, "SIGINT"); });
  let confirmation: string;
  try { confirmation = await input.question("Type 'yes' to confirm: "); }
  finally { input.close(); }
  if (confirmation !== "yes") { console.log("Reset cancelled."); return; }
  const filename = resolveDatabasePath();
  if (fs.existsSync(filename)) {
    const backups = path.resolve(web, "../db_backups");
    await fsp.mkdir(backups, { recursive: true, mode: 0o700 });
    const backup = path.join(backups, `stuco_backup_${Date.now()}_${process.pid}.db`);
    await backupDatabase(filename, backup);
    console.log(`Backup created: ${backup}`);
  } else console.log("No existing database to backup.");
  const database = new Database(filename);
  try {
    database.pragma("foreign_keys=OFF");
    database.transaction(() => {
      const objects = database.prepare("SELECT type,name FROM sqlite_schema WHERE type IN ('view','trigger','table') AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'view' THEN 0 WHEN 'trigger' THEN 1 ELSE 2 END").all() as { type: "view" | "trigger" | "table"; name: string }[];
      for (const object of objects) database.exec(`DROP ${object.type.toUpperCase()} IF EXISTS "${object.name.replaceAll('"', '""')}"`);
      database.exec(schema);
      assertCustomerSchema(database);
      if (database.pragma("integrity_check", { simple: true }) !== "ok" || (database.pragma("foreign_key_check") as unknown[]).length) throw new Error("Reset schema failed SQLite verification; original content rolled back");
    }).immediate();
  } finally { database.close(); }
  console.log(`Database reset complete: ${filename}\nCore and Better Auth schema initialized; all previous data is in the verified backup.`);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string") process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  });
}
