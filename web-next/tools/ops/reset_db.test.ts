import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import Database from "better-sqlite3";

const web = path.resolve(import.meta.dirname, "../..");
const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

test("reset requires stopped writers and typed yes, then resets core and auth with a verified backup", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps reset db ' "));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const repository = path.join(directory, "repo");
  const packageDirectory = path.join(repository, "web-next");
  fs.mkdirSync(path.join(packageDirectory, "tools/ops"), { recursive: true });
  fs.mkdirSync(path.join(repository, "migrations"), { recursive: true });
  fs.mkdirSync(path.join(packageDirectory, "migrations"));
  for (const name of ["node_modules", "lib"]) fs.symlinkSync(path.join(web, name), path.join(packageDirectory, name));
  fs.copyFileSync(path.join(web, "package.json"), path.join(packageDirectory, "package.json"));
  fs.copyFileSync(path.join(web, "tools/ops/reset_db.ts"), path.join(packageDirectory, "tools/ops/reset_db.ts"));
  fs.copyFileSync(path.join(web, "tools/ops/stopped-writers.ts"), path.join(packageDirectory, "tools/ops/stopped-writers.ts"));
  fs.symlinkSync(path.join(web, "tools/sqlite-snapshot.ts"), path.join(packageDirectory, "tools/sqlite-snapshot.ts"));
  const schemaPath = path.join(repository, "migrations/schema.sql");
  const coreSchema = fs.readFileSync(path.join(web, "../migrations/schema.sql"), "utf8");
  fs.writeFileSync(schemaPath, coreSchema);
  fs.copyFileSync(path.join(web, "migrations/better_auth_schema.sql"), path.join(packageDirectory, "migrations/better_auth_schema.sql"));
  fs.writeFileSync(path.join(directory, "systemctl"), "#!/bin/sh\nprintf 'inactive\\n'\nexit 0\n", { mode: 0o700 });
  const filename = path.join(directory, "ledger.db");
  const database = new Database(filename);
  database.exec(fs.readFileSync(path.join(web, "../migrations/schema.sql"), "utf8") + fs.readFileSync(path.join(web, "migrations/better_auth_schema.sql"), "utf8"));
  database.exec("INSERT INTO customers(id,name) VALUES(1,'Old customer'); INSERT INTO accounts(customer_id,balance) VALUES(1,731); INSERT INTO user(id,name,email,role) VALUES('operator','Admin','admin@test','admin')");
  const originalInode = fs.statSync(filename).ino;
  const run = (args: string[], input: string) => spawnSync(process.execPath, ["--import", loader, path.join(packageDirectory, "tools/ops/reset_db.ts"), ...args], {
    cwd: packageDirectory, env: { ...process.env, DATABASE_PATH: filename, PATH: `${directory}:${process.env.PATH}` }, input, encoding: "utf8", timeout: 15_000,
  });
  try {
    assert.notEqual(run([], "yes\n").status, 0);
    assert.equal(run(["--writers-stopped"], "no\n").status, 0);
    fs.writeFileSync(path.join(directory, "systemctl"), "#!/bin/sh\nprintf 'inactive\\n'\nexit 7\n", { mode: 0o700 });
    assert.notEqual(run(["--writers-stopped"], "yes\n").status, 0);
    assert.equal(database.prepare("SELECT balance FROM accounts").pluck().get(), 731);
    assert.equal(database.prepare("SELECT role FROM user").pluck().get(), "admin");
    fs.writeFileSync(path.join(directory, "systemctl"), "#!/bin/sh\nprintf 'inactive\\n'\nexit 0\n", { mode: 0o700 });
    assert.equal(database.prepare("SELECT balance FROM accounts").pluck().get(), 731);
    fs.writeFileSync(schemaPath, coreSchema + "\nINSERT INTO nonexistent VALUES(1);");
    const failed = run(["--writers-stopped"], "yes\n");
    assert.notEqual(failed.status, 0);
    assert.equal(database.prepare("SELECT balance FROM accounts").pluck().get(), 731);
    assert.equal(database.prepare("SELECT role FROM user").pluck().get(), "admin");
    fs.writeFileSync(schemaPath, coreSchema);
    const result = run(["--writers-stopped"], "yes\n");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.statSync(filename).ino, originalInode);
    assert.equal(database.prepare("SELECT count(*) FROM customers").pluck().get(), 0);
    assert.equal(database.prepare("SELECT count(*) FROM user").pluck().get(), 0);
    assert.equal(database.prepare("SELECT value FROM app_meta WHERE key='currency_scale'").pluck().get(), "100");
    const saved = /Backup created: (.+)/.exec(result.stdout)?.[1];
    assert.ok(saved);
    const backup = new Database(saved, { readonly: true });
    try {
      assert.equal(backup.prepare("SELECT balance FROM accounts").pluck().get(), 731);
      assert.equal(backup.prepare("SELECT role FROM user").pluck().get(), "admin");
    } finally { backup.close(); }
  } finally { database.close(); }
});
