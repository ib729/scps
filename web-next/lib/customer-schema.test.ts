import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { assertCustomerSchema, migrateCustomerSchema } from "./customer-schema";

const legacySql = fs.readFileSync(path.join(import.meta.dirname, "../tests/fixtures/legacy-customer.sql"), "utf8");
function fixture(sql = legacySql) {
  const db = new Database(":memory:");
  db.exec(sql);
  return db;
}
function snapshot(db: Database.Database) {
  const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").all();
  const tables = db.prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all();
  const rows = Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all()]));
  return { schema, rows };
}

test("atomic customer migration preserves every identity, cent, credential and sequence", () => {
  const db = fixture();
  try {
    const before = snapshot(db).rows;
    db.pragma("legacy_alter_table=ON");
    migrateCustomerSchema(db);
    assertCustomerSchema(db);
    assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
    assert.equal(db.pragma("legacy_alter_table", { simple: true }), 1);
    assert.deepEqual(db.prepare("SELECT * FROM customers ORDER BY id").all(), before.students);
    for (const table of ["cards", "accounts", "transactions", "overdraft_weeks", "wechat_topup_requests"]) {
      const columns = db.pragma(`table_info(${table})`) as { name: string }[];
      const select = columns.map(({ name }) => name === "customer_id" ? "customer_id AS student_id" : `"${name}"`).join(",");
      assert.deepEqual(db.prepare(`SELECT ${select} FROM ${table} ORDER BY rowid`).all(), before[table], table);
    }
    assert.deepEqual(db.prepare("SELECT user_id,customer_id AS student_id FROM user_customer_links").all(), before.user_student_links);
    for (const table of ["session", "account", "verification", "transaction_note_history", "app_meta"]) {
      assert.deepEqual(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), before[table], table);
    }
    const oldUsers = before.user as { role: string }[];
    assert.deepEqual(db.prepare("SELECT * FROM user ORDER BY rowid").all(), oldUsers.map(user => ({ ...user, role: user.role === "student" ? "customer" : user.role })));
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    assert.equal(db.prepare("SELECT COUNT(*) FROM sqlite_schema WHERE name IN ('students','user_student_links','idx_tx_student_time','idx_transactions_student_id_created_at')").pluck().get(), 0);
    assert.equal(db.prepare("SELECT COUNT(*) FROM sqlite_schema WHERE name IN ('idx_tx_customer_time','idx_transactions_customer_id_created_at','custom_student_cards','custom_user_name','custom_user_updated','custom_customer_audit')").pluck().get(), 6);
    const final = snapshot(db);
    migrateCustomerSchema(db);
    assert.deepEqual(snapshot(db), final);
    db.exec("UPDATE user SET name='Changed user' WHERE id='buyer'; UPDATE customers SET name='Changed customer' WHERE id=1");
    assert.deepEqual(db.prepare("SELECT message FROM audit").pluck().all(), ["Changed user", "Changed customer"]);
    assert.equal(db.prepare("INSERT INTO customers(name) VALUES('Next')").run().lastInsertRowid, 201);
    assert.equal(db.prepare("INSERT INTO transactions(customer_id,type,amount) VALUES(3,'ADJUST',0)").run().lastInsertRowid, 43);
    assert.equal(db.prepare("INSERT INTO wechat_topup_requests(customer_id,requested_amount,payable_amount,created_by_user_id,expires_at) VALUES(3,100,101,'buyer','2030-01-01')").run().lastInsertRowid, 53);
    db.exec("INSERT INTO user(id,name,email) VALUES('new','New','new@test')");
    assert.equal(db.prepare("SELECT role FROM user WHERE id='new'").pluck().get(), "customer");
    assert.throws(() => db.exec("UPDATE user SET role='student' WHERE id='new'"), /CHECK/);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally { db.close(); }
});

test("migration faults roll back the entire original schema and restore connection pragmas", () => {
  const db = fixture();
  try {
    db.pragma("legacy_alter_table=ON");
    const before = snapshot(db);
    const exec = db.exec;
    db.exec = function (sql: string) {
      if (sql.includes('ALTER TABLE "accounts" RENAME COLUMN')) throw new Error("injected post-rename failure");
      return exec.call(this, sql);
    };
    assert.throws(() => migrateCustomerSchema(db), /injected post-rename failure/);
    db.exec = exec;
    assert.deepEqual(snapshot(db), before);
    assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
    assert.equal(db.pragma("legacy_alter_table", { simple: true }), 1);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    assert.equal(db.prepare("SELECT balance FROM accounts WHERE student_id=1").pluck().get(), -731);
  } finally { db.close(); }
});

test("mixed schemas, missing fields, unknown user columns and orphan references refuse without mutation", () => {
  for (const alter of [
    "CREATE TABLE customers(id INTEGER PRIMARY KEY)",
    "CREATE TABLE user_customer_links(user_id TEXT)",
    "ALTER TABLE accounts ADD COLUMN customer_id INTEGER",
    "ALTER TABLE user ADD COLUMN extra TEXT",
    "ALTER TABLE user ADD COLUMN generated_name TEXT GENERATED ALWAYS AS (name) VIRTUAL",
    "ALTER TABLE transactions DROP COLUMN payment_method",
    "PRAGMA foreign_keys=OFF; INSERT INTO session(id,userId,token,expiresAt) VALUES('orphan','missing','orphan',1); PRAGMA foreign_keys=ON",
  ]) {
    const db = fixture();
    try {
      db.exec(alter);
      const before = snapshot(db);
      assert.throws(() => migrateCustomerSchema(db), /schema|column|foreign.key|mixed/i, alter);
      assert.deepEqual(snapshot(db), before, alter);
      assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
    } finally { db.close(); }
  }
});

test("legacy role normalization never promotes a user and refuses unknown user columns", () => {
  const noRole = legacySql
    .replace("role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('admin','staff','student')),", "")
    .replace("user(id,name,email,role,createdAt,updatedAt)", "user(id,name,email,createdAt,updatedAt)")
    .replace("'admin@test','admin',10", "'admin@test',10")
    .replace("'staff@test','staff',11", "'staff@test',11")
    .replace("'buyer@test','student',12", "'buyer@test',12");
  const db = fixture(noRole);
  try {
    migrateCustomerSchema(db);
    assert.deepEqual(db.prepare("SELECT DISTINCT role FROM user").pluck().all(), ["staff"]);
  } finally { db.close(); }
  const unknown = fixture();
  try {
    unknown.pragma("ignore_check_constraints=ON");
    unknown.exec("UPDATE user SET role='unknown' WHERE id='buyer'");
    unknown.pragma("ignore_check_constraints=OFF");
    migrateCustomerSchema(unknown);
    assert.equal(unknown.prepare("SELECT role FROM user WHERE id='buyer'").pluck().get(), "customer");
  } finally { unknown.close(); }
});

test("startup refuses legacy or mixed schemas; fresh final schemas validate without mutation", () => {
  const legacy = fixture();
  try {
    const before = snapshot(legacy);
    assert.throws(() => assertCustomerSchema(legacy), /migrate-customer.*--writers-stopped/);
    assert.deepEqual(snapshot(legacy), before);
    assert.throws(() => legacy.transaction(() => migrateCustomerSchema(legacy))(), /transaction/i);
  } finally { legacy.close(); }
  const fresh = new Database(":memory:");
  try {
    fresh.exec(fs.readFileSync(path.join(import.meta.dirname, "../../migrations/schema.sql"), "utf8"));
    fresh.exec(fs.readFileSync(path.join(import.meta.dirname, "../migrations/better_auth_schema.sql"), "utf8"));
    const before = snapshot(fresh);
    assertCustomerSchema(fresh);
    migrateCustomerSchema(fresh);
    assert.deepEqual(snapshot(fresh), before);
  } finally { fresh.close(); }
});
