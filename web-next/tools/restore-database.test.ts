import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { restoreDatabase } from "../app/cli/db-commands";

const web = path.resolve(import.meta.dirname, "..");
test("restoring a pre-cutover backup normalizes a private snapshot without modifying the source", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-legacy-restore-"));
  const sourcePath = path.join(directory, "legacy.db");
  const activePath = path.join(directory, "active.db");
  const source = new Database(sourcePath);
  const active = new Database(activePath);
  try {
    source.exec(fs.readFileSync(path.join(web, "tests/fixtures/legacy-customer.sql"), "utf8"));
    const original = source.serialize();
    active.exec(fs.readFileSync(path.join(web, "../migrations/schema.sql"), "utf8") + fs.readFileSync(path.join(web, "migrations/better_auth_schema.sql"), "utf8"));
    active.exec("CREATE TABLE user_preferences(user_id TEXT PRIMARY KEY REFERENCES user(id),selected_reader TEXT); INSERT INTO customers(id,name) VALUES(1,'Before restore'); INSERT INTO accounts(customer_id,balance) VALUES(1,999)");
    await restoreDatabase(sourcePath, activePath, active);
    assert.equal(active.prepare("SELECT balance FROM accounts WHERE customer_id=1").pluck().get(), -731);
    assert.equal(active.prepare("SELECT role FROM user WHERE id='buyer'").pluck().get(), "customer");
    assert.equal(active.prepare("SELECT password FROM account WHERE id='credential'").pluck().get(), "hash-value");
    assert.deepEqual(active.pragma("foreign_key_check"), []);
    assert.deepEqual(source.serialize(), original);
    assert.equal(source.prepare("SELECT balance FROM accounts WHERE student_id=1").pluck().get(), -731);
    source.exec("CREATE TABLE customers(id INTEGER PRIMARY KEY)");
    const restored = active.serialize();
    await assert.rejects(restoreDatabase(sourcePath, activePath, active), /mixed|schema/i);
    assert.deepEqual(active.serialize(), restored);
  } finally { active.close(); source.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
