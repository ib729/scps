import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import Database from "better-sqlite3";

const web = path.resolve(import.meta.dirname, "../..");

test("SQL migration snapshots the canonical ledger and rolls back a failing migration", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps migration ' "));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "active ledger.db");
  const database = new Database(filename);
  database.exec("CREATE TABLE value(number); INSERT INTO value VALUES(731)");
  const migration = path.join(directory, "change ledger.sql");
  fs.writeFileSync(migration, "BEGIN; UPDATE value SET number=999; SELECT * FROM nonexistent; COMMIT;");
  const run = () => spawnSync(process.execPath, ["--import", "tsx", "tools/ops/run_migration.ts", migration], {
    cwd: web, env: { ...process.env, DATABASE_PATH: path.relative(web, filename) }, encoding: "utf8", timeout: 15_000,
  });
  try {
    const failed = run();
    assert.notEqual(failed.status, 0);
    assert.equal(database.prepare("SELECT number FROM value").pluck().get(), 731);
    const backups = fs.readdirSync(directory).filter(name => name.startsWith("active ledger.db.backup."));
    assert.equal(backups.length, 1);
    const backup = new Database(path.join(directory, backups[0]), { readonly: true });
    try { assert.equal(backup.prepare("SELECT number FROM value").pluck().get(), 731); }
    finally { backup.close(); }
    fs.writeFileSync(migration, "BEGIN; UPDATE value SET number=999; COMMIT;");
    const succeeded = run();
    assert.equal(succeeded.status, 0, succeeded.stdout + succeeded.stderr);
    assert.equal(database.prepare("SELECT number FROM value").pluck().get(), 999);
  } finally { database.close(); }
});
