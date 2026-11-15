import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";
import { resolveDatabasePath } from "../../lib/database-path";
import { backupDatabase } from "../sqlite-snapshot";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const usage = "Usage: node --import tsx tools/ops/run_migration.ts <migration_file.sql>";
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) { console.log(usage); return; }
  if (args.length !== 1) throw new Error(usage);
  const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const environment = config({ path: path.join(web, ".env.local"), override: false, quiet: true });
  if (environment.error && environment.error.code !== "ENOENT") throw environment.error;
  const candidates = [path.resolve(args[0]), path.resolve(web, "../migrations", args[0])];
  const migration = candidates.find(filename => fs.existsSync(filename) && fs.statSync(filename).isFile());
  if (!migration) throw new Error(`Migration file not found: ${args[0]}`);
  const database = resolveDatabasePath();
  const backup = `${database}.backup.${Date.now()}.${process.pid}`;
  await backupDatabase(database, backup);
  console.log(`Validated pre-migration snapshot: ${backup}`);
  // Preserve sqlite3's SQL and dot-command handling, including explicit transactions.
  const result = spawnSync("sqlite3", ["-bail", database], { input: fs.readFileSync(migration), stdio: ["pipe", "inherit", "inherit"] });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal) throw Object.assign(new Error(`Migration failed; pre-migration snapshot preserved at ${backup}`), { status: result.status, signal: result.signal });
  console.log("Migration complete. For deliberate recovery, stop writers and use scps-cli import-db.");
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "signal" in error && typeof error.signal === "string") process.kill(process.pid, error.signal as NodeJS.Signals);
    else process.exitCode = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 1;
  });
}
