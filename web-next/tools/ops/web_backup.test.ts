import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import Database from "better-sqlite3";

const web = path.resolve(import.meta.dirname, "../..");

test("backup rejects failed compression without replacing an existing archive", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps failed backup ' "));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = path.join(directory, "ledger.db");
  const db = new Database(database);
  db.exec("CREATE TABLE value(number); INSERT INTO value VALUES(731)");
  db.close();
  const archive = path.join(directory, "saved.tar.zst");
  fs.writeFileSync(archive, "previous archive");
  const argumentsFile = path.join(directory, "compressor-arguments.json");
  fs.writeFileSync(path.join(directory, "zstd"), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.ARGUMENTS_FILE, JSON.stringify(process.argv.slice(2))); if(process.env.SIGNAL_COMPRESSION==='1')process.kill(process.pid,'SIGTERM');else process.exit(23);\n`, { mode: 0o700 });
  const result = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/web_backup.ts", archive], {
    cwd: web, env: { ...process.env, DATABASE_PATH: database, ARGUMENTS_FILE: argumentsFile, ZSTD_CLEVEL: "15", ZSTD_NBTHREADS: "0", PATH: `${directory}:${process.env.PATH}` }, encoding: "utf8", timeout: 15_000,
  });
  assert.equal(result.status, 23, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(argumentsFile, "utf8")), ["-15", "-T0", "-c"]);
  const custom = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/web_backup.ts", archive], {
    cwd: web, env: { ...process.env, DATABASE_PATH: database, ARGUMENTS_FILE: argumentsFile, ZSTD_CLEVEL: "3", ZSTD_NBTHREADS: "2", PATH: `${directory}:${process.env.PATH}` }, encoding: "utf8", timeout: 15_000,
  });
  assert.equal(custom.status, 23, custom.stdout + custom.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(argumentsFile, "utf8")), ["-3", "-T2", "-c"]);
  const signalled = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/web_backup.ts", archive], {
    cwd: web, env: { ...process.env, DATABASE_PATH: database, ARGUMENTS_FILE: argumentsFile, SIGNAL_COMPRESSION: "1", ZSTD_CLEVEL: "15", ZSTD_NBTHREADS: "0", PATH: `${directory}:${process.env.PATH}` }, encoding: "utf8", timeout: 15_000,
  });
  assert.equal(signalled.signal, "SIGTERM", signalled.stdout + signalled.stderr);
  const alias = path.join(directory, "alias");
  fs.symlinkSync(directory, alias);
  for (const output of [database, path.join(alias, "ledger.db-wal")]) {
    const rejected = spawnSync(process.execPath, ["--import", "tsx", "tools/ops/web_backup.ts", output], {
      cwd: web, env: { ...process.env, DATABASE_PATH: database, PATH: `${directory}:${process.env.PATH}` }, encoding: "utf8", timeout: 15_000,
    });
    assert.notEqual(rejected.status, 0);
    assert.equal(fs.existsSync(`${database}-wal`), false);
    const original = new Database(database, { readonly: true });
    try { assert.equal(original.prepare("SELECT number FROM value").pluck().get(), 731); }
    finally { original.close(); }
  }
  assert.equal(fs.readFileSync(archive, "utf8"), "previous archive");
  assert.equal(fs.readdirSync(directory).some(name => name.startsWith(".scps-backup.")), false);
});
