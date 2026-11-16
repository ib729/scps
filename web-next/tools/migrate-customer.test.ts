import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import Database from "better-sqlite3";

const web = path.resolve(import.meta.dirname, "..");
test("maintenance requires stopped writers, refuses active service and verifies a recoverable original backup", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps customer migration "));
  const filename = path.join(directory, "ledger with spaces.db");
  const setup = new Database(filename);
  setup.exec(fs.readFileSync(path.join(web, "tests/fixtures/legacy-customer.sql"), "utf8"));
  setup.close();
  const bin = path.join(directory, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "systemctl"), '#!/bin/sh\ncase "$*" in *LoadState*) echo loaded;; *"$ACTIVE_UNIT"*) echo active;; *) echo inactive;; esac\n', { mode: 0o700 });
  const env = { ...process.env, DATABASE_PATH: path.relative(web, filename), PATH: `${bin}:${process.env.PATH}`, ACTIVE_UNIT: "none", NEXT_TELEMETRY_DISABLED: "1" };
  const run = (args: string[], state = "none") => spawnSync(process.execPath, ["--import", "tsx", "tools/migrate-customer.ts", ...args], { cwd: web, env: { ...env, ACTIVE_UNIT: state }, encoding: "utf8", timeout: 15_000 });
  try {
    assert.notEqual(run([]).status, 0);
    for (const unit of ["scps.service", "stuco-web.service"]) {
      const active = run(["--writers-stopped"], unit);
      assert.notEqual(active.status, 0);
      assert.match(active.stderr, /Stop/);
      assert.equal(fs.readdirSync(directory).filter(name => name.includes("pre-customer")).length, 0);
    }
    const migrated = run(["--writers-stopped"]);
    assert.equal(migrated.status, 0, migrated.stderr);
    assert.match(migrated.stdout, /Verified pre-migration backup/);
    const backupName = fs.readdirSync(directory).find(name => name.includes("pre-customer"));
    assert.ok(backupName);
    const backupPath = path.join(directory, backupName);
    assert.equal(fs.statSync(backupPath).mode & 0o777, 0o600);
    const backup = new Database(backupPath, { readonly: true });
    const final = new Database(filename, { readonly: true });
    try {
      assert.equal(backup.pragma("integrity_check", { simple: true }), "ok");
      assert.deepEqual(backup.pragma("foreign_key_check"), []);
      assert.equal(backup.prepare("SELECT balance FROM accounts WHERE student_id=1").pluck().get(), -731);
      assert.equal(backup.prepare("SELECT role FROM user WHERE id='buyer'").pluck().get(), "student");
      assert.equal(final.prepare("SELECT balance FROM accounts WHERE customer_id=1").pluck().get(), -731);
      assert.equal(final.prepare("SELECT role FROM user WHERE id='buyer'").pluck().get(), "customer");
      assert.equal(final.prepare("SELECT password FROM account WHERE id='credential'").pluck().get(), "hash-value");
    } finally { backup.close(); final.close(); }
    const startup = spawnSync(process.execPath, ["--import", "tsx", "server.ts"], { cwd: web, env: { ...env, DATABASE_PATH: backupPath }, encoding: "utf8", timeout: 15_000 });
    assert.notEqual(startup.status, 0);
    assert.match(startup.stderr, /migrate-customer.*--writers-stopped/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
