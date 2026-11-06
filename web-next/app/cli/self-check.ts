import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-cli-check-"));
  const activePath = path.join(directory, "active.db");
  const backupPath = path.join(directory, "backup.db");
  const root = path.resolve(__dirname, "../..");
  const schema = fs.readFileSync(path.join(root, "../migrations/schema.sql"), "utf8") +
    fs.readFileSync(path.join(root, "migrations/better_auth_schema.sql"), "utf8");
  const active = new Database(activePath);
  const backup = new Database(backupPath);
  try {
    for (const database of [active, backup]) {
      database.exec(schema);
      database.pragma("journal_mode = WAL");
      database.exec("INSERT INTO students(id, name) VALUES (1, 'CLI Check'); INSERT INTO accounts(student_id, balance) VALUES (1, 1000)");
    }
    process.env.DATABASE_PATH = activePath;
    // Exercise DB module loading only after the isolated DATABASE_PATH is configured.
    const { parseAdjustmentAmount, applyLedgerAdjustment, restoreDatabase } = await import("./db-commands");
    const { createCliUser, resetCliPassword } = await import("./auth-commands");
    const userId = await createCliUser(active, "CLI Admin", " CLI@EXAMPLE.TEST ", "old-password-123", "admin");
    const auth = betterAuth({
      database: active,
      secret: "cli-self-check-only-secret-not-for-production",
      baseURL: "http://localhost:3000",
      emailAndPassword: { enabled: true },
      user: { additionalFields: { role: { type: "string", input: false } } },
    });
    const login = await auth.api.signInEmail({ body: { email: "cli@example.test", password: "old-password-123" } });
    assert.equal(login.user.id, userId);
    assert.equal(login.user.role, "admin");
    assert.equal(login.user.createdAt.getFullYear(), new Date().getFullYear());
    await resetCliPassword(active, userId, "new-password-123");
    await assert.rejects(auth.api.signInEmail({ body: { email: "cli@example.test", password: "old-password-123" } }));
    assert.equal((await auth.api.signInEmail({ body: { email: "cli@example.test", password: "new-password-123" } })).user.id, userId);
    active.prepare("INSERT INTO user(id, name, email, createdAt, updatedAt) VALUES ('no-credential', 'Staff', 'staff@example.test', ?, ?)").run(new Date().toISOString(), new Date().toISOString());
    await resetCliPassword(active, "no-credential", "staff-password-123");
    assert.equal((await auth.api.signInEmail({ body: { email: "staff@example.test", password: "staff-password-123" } })).user.id, "no-credential");
    assert.equal(parseAdjustmentAmount("5.50"), 550);
    assert.equal(parseAdjustmentAmount("-0.01"), -1);
    for (const input of ["", "0", "0.001", "1junk", "Infinity", "NaN", "9007199254740991"]) {
      assert.throws(() => parseAdjustmentAmount(input), Error, input);
    }
    assert.equal(applyLedgerAdjustment(active, 1, 550, "check"), 1550);
    assert.equal(applyLedgerAdjustment(active, 1, -1, "check"), 1549);
    assert.deepEqual(active.prepare("SELECT type, amount, payment_method, staff FROM transactions ORDER BY id").all(), [
      { type: "TOPUP", amount: 550, payment_method: "Cash", staff: "CLI-Admin" },
      { type: "DEBIT", amount: -1, payment_method: "Balance", staff: "CLI-Admin" },
    ]);
    active.exec("INSERT INTO students(id, name) VALUES (2, 'Missing Account')");
    assert.throws(() => applyLedgerAdjustment(active, 2, 100, "check"));
    assert.equal(active.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM transactions").get()?.count, 2);
    await assert.rejects(restoreDatabase(activePath, activePath, active));
    const invalidPath = path.join(directory, "invalid.db");
    const invalid = new Database(invalidPath);
    invalid.exec("CREATE TABLE unrelated(id INTEGER)");
    invalid.close();
    await assert.rejects(restoreDatabase(invalidPath, activePath, active));
    assert.equal(active.prepare<[], { balance: number }>("SELECT balance FROM accounts WHERE student_id = 1").get()?.balance, 1549);
    const locked = new Database(activePath);
    locked.exec("BEGIN IMMEDIATE");
    try {
      await assert.rejects(restoreDatabase(backupPath, activePath, active));
    } finally {
      locked.exec("ROLLBACK");
      locked.close();
    }
    assert.equal(active.prepare<[], { balance: number }>("SELECT balance FROM accounts WHERE student_id = 1").get()?.balance, 1549);
    // A separate process keeps the active WAL open while the source has uncheckpointed data.
    backup.exec("UPDATE accounts SET balance = 9876 WHERE student_id = 1");
    const observer = spawn(process.execPath, ["-e", `
      const Database = require(process.argv[1]);
      const db = new Database(process.argv[2]);
      console.log("ready");
      process.stdin.on("data", () => {
        db.exec("UPDATE accounts SET balance = balance + 1 WHERE student_id = 1");
        console.log(db.prepare("SELECT balance FROM accounts WHERE student_id = 1").get().balance);
      });
      process.stdin.on("end", () => db.close());
    `, require.resolve("better-sqlite3"), activePath], { stdio: ["pipe", "pipe", "inherit"] });
    await once(observer.stdout, "data");
    const walBefore = fs.statSync(`${activePath}-wal`);
    try {
      await restoreDatabase(backupPath, activePath, active);
      assert.equal(active.prepare<[], { balance: number }>("SELECT balance FROM accounts WHERE student_id = 1").get()?.balance, 9876);
      assert.equal(fs.statSync(`${activePath}-wal`).ino, walBefore.ino);
      const reply = once(observer.stdout, "data");
      observer.stdin.write("update\n");
      assert.equal(Number((await reply)[0].toString().trim()), 9877);
      assert.equal(active.prepare<[], { balance: number }>("SELECT balance FROM accounts WHERE student_id = 1").get()?.balance, 9877);
      assert.equal(active.pragma("integrity_check", { simple: true }), "ok");
    } finally {
      observer.stdin.end();
      await once(observer, "exit");
    }
    const csvPath = path.join(directory, "students.csv");
    fs.writeFileSync(csvPath, "name,uid\nCSV CLI Check,AB12CD34\n");
    const importer = path.resolve(root, "../hardware-pi/batch_import_students.py");
    const options = { cwd: directory, env: { ...process.env, DATABASE_PATH: activePath }, encoding: "utf8" as const };
    assert.equal(spawnSync("python3", [importer, csvPath, "--dry-run"], options).status, 0);
    assert.equal(active.prepare("SELECT id FROM students WHERE name = 'CSV CLI Check'").get(), undefined);
    const imported = spawnSync("python3", [importer, csvPath], options);
    assert.equal(imported.status, 0, imported.stdout + imported.stderr);
    assert.ok(active.prepare("SELECT id FROM students WHERE name = 'CSV CLI Check'").get());
    assert.equal(fs.existsSync(path.join(directory, "stuco.db")), false);
    console.log("CLI credentials, amounts, ledger rollback, restore validation, lock refusal, cross-process WAL, and CSV checks passed.");
  } finally {
    active.close();
    backup.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
