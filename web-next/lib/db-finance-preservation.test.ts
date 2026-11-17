import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import Database from "better-sqlite3";

const financeSchema = `
    CREATE TABLE IF NOT EXISTS finance_setup_versions (
      revision INTEGER PRIMARY KEY, start_month TEXT NOT NULL,
      cash INTEGER NOT NULL CHECK(typeof(cash)='integer' AND cash>=0),
      wechat INTEGER NOT NULL CHECK(typeof(wechat)='integer' AND wechat>=0),
      alipay INTEGER NOT NULL CHECK(typeof(alipay)='integer' AND alipay>=0),
      reason TEXT, recorded_by_id TEXT NOT NULL, recorded_by_name TEXT NOT NULL, recorded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS finance_entry_versions (
      entry_id TEXT NOT NULL, revision INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('expense','income','transfer')),
      effective_date TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('WeChat','Alipay','Cash')),
      to_channel TEXT CHECK(to_channel IN ('WeChat','Alipay','Cash')),
      amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0), description TEXT NOT NULL,
      recipient TEXT, reference TEXT, voided INTEGER NOT NULL CHECK(voided IN (0,1)), reason TEXT,
      recorded_by_id TEXT NOT NULL, recorded_by_name TEXT NOT NULL, recorded_at TEXT NOT NULL,
      PRIMARY KEY(entry_id, revision),
      CHECK((kind='transfer' AND to_channel IS NOT NULL AND to_channel<>channel) OR (kind<>'transfer' AND to_channel IS NULL))
    );
    CREATE INDEX IF NOT EXISTS idx_finance_entry_date ON finance_entry_versions(effective_date,entry_id);
    CREATE TABLE IF NOT EXISTS finance_balance_versions (
      month TEXT NOT NULL, revision INTEGER NOT NULL,
      cash INTEGER NOT NULL CHECK(typeof(cash)='integer' AND cash>=0),
      wechat INTEGER NOT NULL CHECK(typeof(wechat)='integer' AND wechat>=0),
      alipay INTEGER NOT NULL CHECK(typeof(alipay)='integer' AND alipay>=0),
      explanation TEXT, recorded_by_id TEXT NOT NULL, recorded_by_name TEXT NOT NULL, recorded_at TEXT NOT NULL,
      PRIMARY KEY(month,revision)
    );
    CREATE TABLE IF NOT EXISTS finance_reports (
      id INTEGER PRIMARY KEY, month TEXT NOT NULL, revision INTEGER NOT NULL, source_hash TEXT NOT NULL,
      snapshot_json TEXT NOT NULL, reason TEXT, recorded_by_id TEXT NOT NULL, recorded_by_name TEXT NOT NULL,
      recorded_at TEXT NOT NULL, UNIQUE(month,revision)
    );
`;

for (const legacy of [false, true]) test(`startup ${legacy ? "preserves historical Finance records" : "does not create Finance tables"}`, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-finance-preservation-"));
  const databasePath = path.join(directory, "fixture.sqlite");
  try {
    const db = new Database(databasePath);
    try {
      db.exec(fs.readFileSync("../migrations/schema.sql", "utf8"));
      db.exec(fs.readFileSync("migrations/better_auth_schema.sql", "utf8"));
      db.exec("INSERT INTO customers(id,name) VALUES(1,'Fixture'); INSERT INTO accounts(customer_id,balance) VALUES(1,531); INSERT INTO transactions(customer_id,type,amount) VALUES(1,'TOPUP',531)");
      if (legacy) {
        db.exec(financeSchema);
        const actor = ["old-admin", "Former Admin", "2020-11-01T00:00:00.000Z"];
        db.prepare("INSERT INTO finance_setup_versions VALUES(1,'2020-10',2000,10000,0,NULL,?,?,?)").run(...actor);
        db.prepare("INSERT INTO finance_entry_versions VALUES('00000000-0000-4000-8000-000000000001',1,'expense','2020-10-10','WeChat',NULL,3500,'Saved expense',NULL,NULL,0,NULL,?,?,?)").run(...actor);
        db.prepare("INSERT INTO finance_balance_versions VALUES('2020-10',1,2000,6500,0,NULL,?,?,?)").run(...actor);
        db.prepare("INSERT INTO finance_reports VALUES(1,'2020-10',1,'legacy-fixture',?,NULL,?,?,?)").run('{"legacy":"retained"}', ...actor);
      }
    } finally { db.close(); }
    const snapshot = () => {
      const connection = new Database(databasePath, { readonly: true });
      try {
        const schema = connection.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name LIKE 'finance_%' OR name='idx_finance_entry_date' ORDER BY name").all();
        const ledger = ["customers", "accounts", "transactions"].map(table => connection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
        const finance = legacy ? ["finance_setup_versions", "finance_entry_versions", "finance_balance_versions", "finance_reports"].map(table => connection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()) : [];
        return { schema, ledger, finance };
      } finally { connection.close(); }
    };
    const before = snapshot();
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", "const {getDb,closeDb}=await import('./lib/db.ts');getDb();closeDb();"], { cwd: process.cwd(), env: { ...process.env, DATABASE_PATH: databasePath, NODE_ENV: "test" }, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(snapshot(), before);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
