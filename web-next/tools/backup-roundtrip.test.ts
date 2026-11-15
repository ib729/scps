import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test, type TestContext } from "node:test";
import Database from "better-sqlite3";
import { extractBackup } from "./sqlite-snapshot";

const web = path.resolve(import.meta.dirname, "..");
const root = path.dirname(web);
const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

function fixture(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps backup workflows ' "));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const repository = path.join(directory, "repo");
  for (const name of ["web-next/package.json", "web-next/tools/ops/web_backup.ts", "web-next/tools/ops/cloud_backup_r2.ts", "web-next/tools/ops/restore_from_r2.ts", "web-next/tools/ops/stopped-writers.ts", "web-next/lib/database-path.ts"]) {
    const destination = path.join(repository, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, name), destination);
    fs.chmodSync(destination, 0o700);
  }
  fs.symlinkSync(path.join(web, "tools/sqlite-snapshot.ts"), path.join(repository, "web-next/tools/sqlite-snapshot.ts"));
  for (const name of ["node_modules", "app", "migrations", "tsconfig.json"]) {
    fs.symlinkSync(path.join(web, name), path.join(repository, "web-next", name));
  }
  fs.symlinkSync(path.join(root, "migrations"), path.join(repository, "migrations"));
  const bin = path.join(directory, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "systemctl"), "#!/bin/sh\nprintf 'inactive\\n'\nexit 0\n", { mode: 0o700 });
  const filename = path.join(directory, "active ledger.db");
  const database = new Database(filename);
  database.exec(fs.readFileSync(path.join(root, "migrations/schema.sql"), "utf8") + fs.readFileSync(path.join(web, "migrations/better_auth_schema.sql"), "utf8"));
  database.exec("INSERT INTO customers(id,name) VALUES(1,'Backup check'); INSERT INTO accounts(customer_id,balance) VALUES(1,731)");
  database.close();
  const remote = path.join(directory, "local remote");
  fs.mkdirSync(remote);
  const config = path.join(directory, "rclone.conf");
  fs.writeFileSync(config, `[local-raw]\ntype = alias\nremote = ${remote}\n[local-crypt]\ntype = alias\nremote = ${remote}\n`);
  fs.writeFileSync(path.join(repository, "web-next/.env.local"), `DATABASE_PATH=${JSON.stringify(path.relative(path.join(repository, "web-next"), filename))}\n`);
  const env: NodeJS.ProcessEnv = {
    ...process.env, RCLONE_CONFIG: config,
    RCLONE_REMOTE: "local-raw", RCLONE_CRYPT_REMOTE: "local-crypt", R2_PATH: "local-only",
    PATH: `${bin}:${process.env.PATH}`,
  };
  delete env.DATABASE_PATH;
  const run = (script: string, args: string[], cwd: string, overrides: Partial<NodeJS.ProcessEnv> = {}) => spawnSync(process.execPath, ["--import", loader, path.join(repository, "web-next/tools/ops", script), ...args], {
    cwd, env: { ...env, ...overrides }, encoding: "utf8", timeout: 30_000,
  });
  return { directory, repository, filename, remote, env, run, bin };
}

function readBalance(filename: string) {
  const database = new Database(filename, { readonly: true, fileMustExist: true });
  try { return database.prepare("SELECT balance FROM accounts WHERE customer_id=1").pluck().get(); }
  finally { database.close(); }
}

test("web backup honors the configured ledger from root/package cwd and never publishes failed compression", async t => {
  const { directory, repository, filename, run, bin, env } = fixture(t);
  for (const [index, cwd] of [repository, path.join(repository, "web-next")].entries()) {
    const archive = path.join(directory, `web-${index}.tar.zst`);
    const result = run("web_backup.ts", [archive], cwd);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const stage = path.join(directory, `web-stage-${index}`);
    fs.mkdirSync(stage);
    assert.equal(readBalance(await extractBackup(archive, stage)), 731);
  }
  fs.writeFileSync(path.join(bin, "zstd"), "#!/bin/sh\nexit 1\n", { mode: 0o700 });
  const failed = path.join(directory, "failed.tar.zst");
  const result = run("web_backup.ts", [failed], repository, { PATH: `${bin}:${env.PATH}` });
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(failed), false);
  assert.equal(fs.readdirSync(directory).some(name => name.startsWith(".scps-backup.")), false);
  assert.equal(readBalance(filename), 731);
});

test("local rclone roundtrip restores 731 after live 999 and preserves 999 in the pre-restore snapshot", async t => {
  const { directory, repository, filename, remote, run } = fixture(t);
  const database = new Database(filename);
  database.pragma("journal_mode=WAL");
  try {
    const upload = run("cloud_backup_r2.ts", [], path.join(repository, "web-next"));
    assert.equal(upload.status, 0, upload.stdout + upload.stderr);
    const archives = fs.readdirSync(remote).filter(name => name.endsWith(".tar.zst"));
    assert.equal(archives.length, 1);
    database.exec("UPDATE accounts SET balance=999 WHERE customer_id=1");
    const restore = run("restore_from_r2.ts", [archives[0], "--writers-stopped"], repository);
    assert.equal(restore.status, 0, restore.stdout + restore.stderr);
    assert.equal(database.prepare("SELECT balance FROM accounts WHERE customer_id=1").pluck().get(), 731);
  } finally { database.close(); }
  const backups = fs.readdirSync(path.join(repository, "db_backups")).filter(name => name.startsWith("pre_restore"));
  assert.equal(backups.length, 1);
  const stage = path.join(directory, "pre-restore-stage");
  fs.mkdirSync(stage);
  const saved = await extractBackup(path.join(repository, "db_backups", backups[0]), stage);
  assert.equal(readBalance(saved), 999);
});
